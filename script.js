let map; // 네이버 지도 객체
let currentPolygons = []; // 현재 표시 중인 폴리곤 목록
let seoulPolygons = []; // 서울 표시 폴리곤
let marker = null; // 클릭한 위치의 마커
let isProcessing = false; // 반복문 진행 여부
let isMarkerMoving = true; // 마커가 마우스를 따라다니는지 여부
let globalGeoJSONData = null; // 전역 GeoJSON 데이터
let clusteredTop10 = null; // clustered_top_10.json 데이터를 저장할 변수
let currentPoint = []; // x, y 현재 위치 표시 [lat, lng]
let currentCommerceZone = "";
let infoWindow = null; // InfoWindow for displaying the chart
let globalChartData = null;
let activeCharts = []; // 현재 활성화된 차트 인스턴스를 추적하는 배열

const colors = [
  "#0A5EB0",
  "#659287",
  "#FC8F54",
  "#AE445A",
  "#9165a9",
  "#78B7D0",
  "#218639",
  "#5F6F65",
  "#cb526e",
]; // Cluster별 색상 배열

// 지도 초기화
function initMap() {
  map = new naver.maps.Map("map", {
    center: new naver.maps.LatLng(37.5665, 126.978), // 서울 중심 좌표
    zoom: 12,
  });

  // 마커 추가 안내
  showAlert("마커를 찍어주세요.");

  // 마커가 마우스를 따라다니도록 설정
  enableMarkerFollow();

  infoWindow = new naver.maps.InfoWindow({
    content: "", // Empty initially
    backgroundColor: "white",
    borderColor: "#ccc",
    borderWidth: 2,
    disableAnchor: false,
  });

  // JSON 데이터 로드 후 폴리곤 그리기
  loadPolygonInSeoul().then((polygonData) => {
    drawPolygonsOnMap(polygonData);
  });
}

// 사이드바 업데이트
function updateSidebar(cluster, clusterData, excludedCDN) {
  renderRecommendationList(clusterData);

  const body = document.getElementById("sidebarBody");

  body.innerHTML = `
    <h3>서울 내 유사 상권</h3>
    <ul>
      ${excludedCDN
        .map(
          (cdn) =>
            `<li>
              <button class="navigate-button" data-coords="${cdn.coords.join(
                ","
              )}">${cdn.name}</button>
            </li>`
        )
        .join("")}
    </ul>
  `;

  // 버튼 이벤트 추가
  document.querySelectorAll(".navigate-button").forEach((button) => {
    button.addEventListener("click", () => {
      // 버튼에서 데이터 좌표 읽기
      const [x, y] = button.dataset.coords.split(",").map(Number);

      if (!x || !y) {
        showAlert("잘못된 좌표 데이터입니다.");
        return;
      }

      const newLatLng = new naver.maps.LatLng(y, x); // 네이버 지도 좌표 생성 (위도, 경도)

      // 기존 마커 제거
      if (marker) {
        marker.setMap(null);
      }

      // 지도를 새로운 위치로 이동
      map.setCenter(newLatLng);
      map.setZoom(16);

      // 새로운 위치에 마커 추가
      marker = new naver.maps.Marker({
        position: newLatLng,
        map: map,
        icon: {
          url: "./marker.png",
        },
        clickable: false,
      });

      // 현재 위치 및 상권 정보 업데이트
      currentPoint = [x, y];
      currentCommerceZone = button.textContent.trim();

      // 사이드바 업데이트
      updateSidebar(cluster, clusterData, excludedCDN);
      displayChartInPanel();

      // showAlert(`새로운 상권으로 이동: ${currentCommerceZone}`);
    });
  });

  scrollToTopSidebar();
}

// Function to render the recommendation list
function renderRecommendationList(data) {
  const container = document.getElementById("recommendationList");
  container.innerHTML = `
  <h3>해당 클러스터 업종 추천</h3>
  <p>월 업종별 평균 매출 (억원)</p>
  `; // Clear previous content

  data.forEach((item, index) => {
    const listItem = document.createElement("div");
    listItem.className = "list-item";

    // Left part: SCN and Number_of_Stores
    const leftPart = document.createElement("div");
    leftPart.className = "item-left";

    const info = document.createElement("div");
    info.className = "item-info";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = item.SCN;

    const subtitle = document.createElement("div");
    subtitle.className = "item-subtitle";
    subtitle.textContent = `${item.Number_of_Stores} 개`;

    info.appendChild(title);
    info.appendChild(subtitle);
    leftPart.appendChild(info);

    // Right part: Rank (Average_Sales_Per_Store)
    const rank = document.createElement("div");
    rank.className = "item-rank";
    rank.textContent = `${(item.Average_Sales_Per_Store / 100_000_000).toFixed(
      2
    )}`; // Rank based on index

    listItem.appendChild(leftPart);
    listItem.appendChild(rank);
    container.appendChild(listItem);
  });
}

function scrollToTopSidebar() {
  const sidebar = document.querySelector(".sidebar"); // 팝업의 콘텐츠 컨테이너
  if (sidebar) {
    sidebar.scrollTop = 0; // 스크롤을 최상단으로 이동
  }
}

// 마커가 마우스를 따라다니게 설정
function enableMarkerFollow() {
  var markerOptions = {
    position: map.getCenter(),
    map: map,
    icon: {
      url: "./marker.png",
    },
    clickable: false,
  };
  marker = new naver.maps.Marker(markerOptions);

  naver.maps.Event.addListener(map, "mousemove", (e) => {
    if (isMarkerMoving) {
      marker.setPosition(e.coord);
    }
  });

  naver.maps.Event.addListener(map, "click", (e) => {
    if (isProcessing) return;

    const markerPosition = e.coord;

    if (isMarkerMoving) {
      isMarkerMoving = false; // 마커 고정
      marker.setPosition(markerPosition);

      // 상권 포함 여부 확인
      isProcessing = true;
      const result = findClusterForPoint(
        [markerPosition.lng(), markerPosition.lat()],
        globalGeoJSONData
      );

      if (result) {
        // 현재 위치 저장
        currentPoint = [markerPosition.lat(), markerPosition.lng()];

        // 현재 상권 이름 저장
        currentCommerceZone = result.codename;

        map.setCenter(markerPosition);
        map.setZoom(16);

        // `clustered_top_10.json`에서 CSN 데이터 로드
        const clusterData = clusteredTop10[result.cluster];
        const excludedCDN = globalGeoJSONData[result.cluster].features
          .filter((item) => item.properties.SCN !== currentCommerceZone)
          .map((item) => ({
            name: item.properties.CDN,
            coords: [item.properties.X, item.properties.Y], // 좌표를 제공한다고 가정
          }));

        // 사이드바 열기
        openSidebar();

        // showAlert(`선택된 상권: ${result.codename}`);
        updateSidebar(result.cluster, clusterData, excludedCDN);
        renderClusterPolygons(globalGeoJSONData, result.cluster);
        displayChartInPanel();
      } else {
        showAlert("상권 데이터가 존재하지 않습니다.\n다시 선택해주세요.");
        isMarkerMoving = true; // 다시 마커가 마우스를 따라다니도록 설정
      }
      isProcessing = false;
    }
  });
}

// 특정 점이 폴리곤 내에 포함되는지 확인하는 함수 (Ray-casting 알고리즘)
function isPointInPolygon(point, polygon) {
  const [x, y] = point; // 점의 좌표
  let inside = false;

  if (!Array.isArray(polygon)) {
    console.error("폴리곤 데이터가 배열이 아닙니다:", polygon);
    return false;
  }

  console.log("Checking point:", point, "in polygon:", polygon);

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = Array.isArray(polygon[i]) ? polygon[i] : [null, null];
    const [xj, yj] = Array.isArray(polygon[j]) ? polygon[j] : [null, null];

    if (xi === null || yi === null || xj === null || yj === null) {
      console.error("잘못된 좌표 데이터:", polygon[i], polygon[j]);
      continue;
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

// GeoJSON 데이터에서 특정 점이 포함된 폴리곤 및 클러스터를 찾는 함수
function findClusterForPoint(point, geoJSONData) {
  console.log("Searching for point in GeoJSON data:", point);

  for (const cluster in geoJSONData) {
    console.log(`Checking cluster: ${cluster}`);
    const features = geoJSONData[cluster].features;

    for (const feature of features) {
      const geometry = feature.geometry;
      console.log("Feature being checked:", geometry);

      const polygons =
        geometry.type === "Polygon"
          ? [geometry.coordinates] // 단일 폴리곤
          : geometry.coordinates; // 멀티폴리곤

      for (const polygon of polygons) {
        console.log("Checking polygon:", polygon);

        // 배열인지 확인하고 데이터 구조를 보정
        const polygonCoordinates = Array.isArray(polygon[0])
          ? polygon[0]
          : polygon;

        if (Array.isArray(polygonCoordinates)) {
          if (isPointInPolygon(point, polygonCoordinates)) {
            return {
              codename: feature.properties.CDN,
              cluster: feature.properties.Cluster,
              details: feature.properties,
            };
          }
        } else {
          console.error("Unexpected polygon structure:", polygon);
        }
      }
    }
  }

  return null; // 어떤 폴리곤에도 포함되지 않는 경우
}

// Cluster별 폴리곤 렌더링
function renderClusterPolygons(data, cluster) {
  // 이전에 표시된 폴리곤 제거
  currentPolygons.forEach((polygon) => polygon.setMap(null));
  currentPolygons = [];

  const clusterData = data[cluster];
  clusterData.features.forEach((feature) => {
    const geometry = feature.geometry;

    if (geometry.type === "Polygon") {
      // 단일 폴리곤 처리
      const coordinates = geometry.coordinates[0].map(([lng, lat]) => {
        return new naver.maps.LatLng(lat, lng);
      });

      const color = colors[cluster % colors.length];

      const polygon = new naver.maps.Polygon({
        map: map,
        paths: coordinates,
        fillColor: color,
        fillOpacity: 0.12,
        strokeColor: color,
        strokeWeight: 2,
      });

      currentPolygons.push(polygon);
    } else if (geometry.type === "MultiPolygon") {
      // 멀티폴리곤 처리
      geometry.coordinates.forEach((polygonCoordinates) => {
        const coordinates = polygonCoordinates[0].map(([lng, lat]) => {
          return new naver.maps.LatLng(lat, lng);
        });

        const color = colors[cluster % colors.length];

        const polygon = new naver.maps.Polygon({
          map: map,
          paths: coordinates,
          fillColor: color,
          fillOpacity: 0.12,
          strokeColor: color,
          strokeWeight: 2,
        });

        currentPolygons.push(polygon);
      });
    } else {
      console.error("지원하지 않는 geometry type:", geometry.type);
    }
  });
}

// Function to display a chart in the popup
function displayChartInPanel() {
  if (!globalChartData) {
    console.error("No data loaded.");
    return;
  }

  const selectedData = globalChartData.find(
    (item) => item.상권_코드_명 === currentCommerceZone
  );

  if (!selectedData) {
    showAlert("Data not found for the selected 상권_코드.");
    return;
  }

  // Prepare data for Bar chart
  const barLabels = ["23년 2분기", "24년 2분기"];
  const barData = [
    selectedData["2023_2Q_매출액"],
    selectedData["2024_2Q_매출액"],
  ];

  // Prepare data for Chart.js
  const labels = [
    "23년 2분기",
    "23년 3분기",
    "23년 4분기",
    "24년 1분기",
    "24년 2분기",
  ];

  const 면적당_유동인구 = [
    Math.round(
      selectedData["23Q2_유동인구"] / (selectedData["영역_면적"] / 10000)
    ),
    Math.round(
      selectedData["23Q3_유동인구"] / (selectedData["영역_면적"] / 10000)
    ),
    Math.round(
      selectedData["23Q4_유동인구"] / (selectedData["영역_면적"] / 10000)
    ),
    Math.round(
      selectedData["24Q1_유동인구"] / (selectedData["영역_면적"] / 10000)
    ),
    Math.round(
      selectedData["24Q2_유동인구"] / (selectedData["영역_면적"] / 10000)
    ),
  ];

  const 일평균_유동인구 = [
    Math.round(selectedData["23Q2_유동인구"] / 91),
    Math.round(selectedData["23Q3_유동인구"] / 91),
    Math.round(selectedData["23Q4_유동인구"] / 91),
    Math.round(selectedData["24Q1_유동인구"] / 91),
    Math.round(selectedData["24Q2_유동인구"] / 91),
  ];

  // Prepare data for Pie chart
  const pieLabels = [];
  const pieData = [];

  for (const key in selectedData) {
    if (key.startsWith("소비트렌드_")) {
      pieLabels.push(key.replace("소비트렌드_", "")); // "소비트렌드_" 제거
      pieData.push(selectedData[key]);
    }
  }

  // 데이터와 레이블을 객체 배열로 결합
  const combinedPieData = pieLabels.map((label, index) => ({
    label: label,
    value: pieData[index],
  }));

  // 데이터 값을 기준으로 내림차순 정렬
  combinedPieData.sort((a, b) => b.value - a.value);

  // 정렬된 데이터를 분리
  const sortedPieLabels = combinedPieData.map((item) => item.label);
  const sortedPieData = combinedPieData.map((item) => item.value);

  // 패널 가져오기
  const panel = document.getElementById("chartPanel");
  const commerceZone = document.getElementById("commerce-zone");
  const barChartCanvas = document.getElementById("barChartCanvas");
  const chart1Canvas = document.getElementById("chart1Canvas");
  const chart2Canvas = document.getElementById("chart2Canvas");
  const pieChartCanvas = document.getElementById("pieChartCanvas");

  // 그래프 내용 넣기
  const barChartCanvasContents = document.getElementById(
    "barChartCanvas-content"
  );
  const barDataPercent = ((barData[1] - barData[0]) / barData[0]) * 100;
  const barDataIncreaseDecrease = barDataPercent >= 0 ? "증가" : "감소";
  barChartCanvasContents.textContent = `전년 동분기 매출액 비교 (${Math.abs(
    barDataPercent
  ).toFixed(2)}% ${barDataIncreaseDecrease})`;

  commerceZone.textContent = currentCommerceZone;

  // 캔버스와 관련된 기존 차트를 모두 제거
  activeCharts.forEach((chart) => chart.destroy());
  activeCharts = []; // 활성화된 차트 목록 초기화

  // Reset the panel display
  panel.classList.remove("hidden");

  // Chart.register(ChartDataLabels);

  const barCtx = barChartCanvas.getContext("2d");

  // Bar 차트 생성
  const barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: barLabels,
      datasets: [
        {
          label: "매출액 (만원)",
          data: barData,
          backgroundColor: ["#345e88", "#5a8aba"], // Bar 색상
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#ccccccec",
          },
        },
        tooltip: {
          enabled: true, // 툴팁 활성화
        },
        datalabels: {
          display: true,
          color: "#ffffff", // 데이터 라벨 색상
          anchor: "end", // 라벨 위치
          align: "top", // 라벨 정렬
          formatter: (value) => value.toLocaleString(), // 숫자를 천 단위로 포맷
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#ccccccec",
          },
        },
        y: {
          ticks: {
            color: "#ccccccec",
          },
        },
      },
    },
  });

  // Clear any previous chart instances
  const line1Chart = new Chart(chart1Canvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "유동인구 (명/ha)",
          data: 면적당_유동인구,
          borderColor: "#5a8aba",
          backgroundColor: "rgba(75, 151, 192, 0.2)",
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#ccccccec",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#ccccccec",
          },
        },
        y: {
          ticks: {
            color: "#ccccccec",
          },
        },
      },
    },
  });

  // 두 번째 그래프 생성
  const line2Chart = new Chart(chart2Canvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "일평균 유동인구",
          data: 일평균_유동인구,
          borderColor: "#5a8aba",
          backgroundColor: "rgba(75, 151, 192, 0.2)",
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#ccccccec",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#ccccccec",
          },
        },
        y: {
          ticks: {
            color: "#ccccccec",
          },
        },
      },
    },
  });

  const pieCtx = pieChartCanvas.getContext("2d");

  // Pie 차트 생성
  const pieChart = new Chart(pieCtx, {
    type: "pie",
    data: {
      labels: sortedPieLabels,
      datasets: [
        {
          label: "소비트렌드",
          data: sortedPieData,
          backgroundColor: hexToRgbaWithOpacity(colors, 0.8),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "right",
          labels: {
            boxWidth: 20, // 색상 박스 크기
            color: "#ccccccec",
            padding: 20, // 항목 간 간격
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = context.dataset.data.reduce(
                (acc, value) => acc + value,
                0
              );
              const percentage = ((context.raw / total) * 100).toFixed(2);
              return `${percentage}%`;
            },
          },
        },
      },
    },
    plugins: [
      {
        id: "custom-labels",
        beforeDraw(chart) {
          const { width } = chart;
          const { datasets } = chart.data;
          const ctx = chart.ctx;
          const total = datasets[0].data.reduce((acc, value) => acc + value, 0);

          chart.data.labels.forEach((label, i) => {
            const value = datasets[0].data[i];
            const percentage = ((value / total) * 100).toFixed(1);
            const { x, y } = chart.getDatasetMeta(0).data[i].tooltipPosition();

            ctx.fillStyle = "#cccccc";
            ctx.textAlign = "center";
            ctx.font = `${width * 0.03}px Arial`;
            percentage > 5 ? ctx.fillText(`${percentage}%`, x, y) : "";
          });
        },
      },
    ],
  });

  // 새로운 차트를 활성화된 차트 목록에 추가
  activeCharts.push(barChart);
  activeCharts.push(line1Chart);
  activeCharts.push(line2Chart);
  activeCharts.push(pieChart);

  // 패널 스크롤을 최상단으로 이동
  scrollToTopPanel();
}

function scrollToTopPanel() {
  const popupContent = document.querySelector(".chart-panel-content"); // 팝업의 콘텐츠 컨테이너
  if (popupContent) {
    popupContent.scrollTop = 0; // 스크롤을 최상단으로 이동
  }
}

// clustered_top_10.json 파일 로드
function loadClusteredTop10() {
  const url = "./clustered_top_10.json"; // 파일 경로

  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("clustered_top_10.json 파일을 불러올 수 없습니다.");
      }
      return response.json();
    })
    .then((data) => {
      clusteredTop10 = data;
      console.log("clustered_top_10.json 로드 완료:", clusteredTop10);
    })
    .catch((error) => {
      console.error("clustered_top_10.json 로드 중 오류:", error);
    });
}

// clustered_top_10.json 파일 로드
function loadMetadata() {
  const url = "./commercial_metadata.json"; // 파일 경로

  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("commercial_metadata.json 파일을 불러올 수 없습니다.");
      }
      return response.json();
    })
    .then((data) => {
      globalChartData = data;
      console.log("commercial_metadata.json 로드 완료:", globalChartData);
    })
    .catch((error) => {
      console.error("commercial_metadata.json 로드 중 오류:", error);
    });
}

// GeoJSON 데이터를 클러스터별로 분리하여 저장
function loadAndGroupGeoJSON() {
  const geojsonUrl = "./commercial_zones.geojson";

  fetch(geojsonUrl)
    .then((response) => {
      if (!response.ok) throw new Error("GeoJSON 파일을 불러올 수 없습니다.");
      return response.json();
    })
    .then((data) => {
      const groupedClusters = {};

      data.features.forEach((feature) => {
        const cluster = feature.properties.Cluster;
        if (!groupedClusters[cluster]) {
          groupedClusters[cluster] = {
            type: "FeatureCollection",
            features: [],
          };
        }
        groupedClusters[cluster].features.push(feature);
      });

      globalGeoJSONData = groupedClusters;
      console.log("클러스터별 데이터 분리 완료:", groupedClusters);
    })
    .catch((error) => {
      console.error("GeoJSON 로드 중 오류:", error);
    });
}

// JSON 파일에서 폴리곤 데이터를 가져오는 함수
function loadPolygonInSeoul() {
  const jsonFilePath = "./seoul_area.geojson";

  return fetch(jsonFilePath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load JSON file: ${response.statusText}`);
      }
      return response.json(); // JSON 파싱
    })
    .then((data) => {
      if (!data.features || !Array.isArray(data.features)) {
        throw new Error("Invalid GeoJSON format: 'features' array not found");
      }

      // 모든 Feature의 coordinates 추출
      const polygonData = data.features
        .map((feature) => {
          if (feature.geometry && feature.geometry.type === "Polygon") {
            return feature.geometry.coordinates[0]; // Polygon의 첫 번째 좌표 배열
          } else if (
            feature.geometry &&
            feature.geometry.type === "MultiPolygon"
          ) {
            return feature.geometry.coordinates.map((polygon) => polygon[0]); // MultiPolygon의 각 폴리곤 좌표 배열
          }
          return null; // 유효하지 않은 경우
        })
        .filter(Boolean); // 유효하지 않은 데이터를 제거

      return polygonData; // 추출된 coordinates 데이터 반환
    })
    .catch((error) => {
      console.error("Error loading polygon data:", error);
    });
}

// 폴리곤 데이터를 지도에 그리는 함수
function drawPolygonsOnMap(polygonData) {
  if (!polygonData || polygonData.length === 0) {
    console.error("No polygon data available to draw.");
    return;
  }

  polygonData.forEach((coordinates) => {
    // 좌표를 변환하여 네이버 지도 LatLng 형식으로 변환
    const latLngPath = coordinates.map(
      ([lng, lat]) => new naver.maps.LatLng(lat, lng)
    );

    // 폴리곤 객체 생성
    const polygon = new naver.maps.Polygon({
      map: map, // 네이버 지도 객체
      paths: latLngPath, // 폴리곤 경로
      fillColor: "transparent", // 내부 색상 투명
      strokeColor: "#2c3e50", // 테두리 색상
      strokeWeight: 3, // 테두리 두께
      strokeStyle: "shortdash", // 점선 스타일
      strokeLineCap: "round",
    });

    seoulPolygons.push(polygon); // 생성된 폴리곤 객체를 배열에 저장
  });

  console.log("Polygons drawn on map:", seoulPolygons);
}

// 마커 재설정 버튼 추가
function addResetButton() {
  // 버튼 생성
  const resetButton = document.createElement("button");
  resetButton.classList.add("reset-button");

  // 버튼 클릭 이벤트
  resetButton.addEventListener("click", () => {
    // 마커를 초기 상태로 재설정
    if (marker) {
      marker.setPosition(map.getCenter()); // 초기 지도 중심으로 마커 이동
    }
    isMarkerMoving = true; // 마커가 마우스를 따라다니도록 설정
    showAlert("마커가 재설정되었습니다.\n클릭하여 새로운 위치를 선택하세요.");
  });

  // 버튼을 body에 추가
  document.body.appendChild(resetButton);
}

function openSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggleButton");

  // 사이드바 열기
  if (!sidebar.classList.contains("open")) {
    sidebar.classList.add("open");
    toggleButton.innerText = "◀";
    toggleButton.style.left = "310px"; // 열린 상태에서 버튼 위치
  }
}

// 팝업 표시 함수
function showAlert(message) {
  const alertBox = document.getElementById("customAlert");
  const alertMessage = document.getElementById("alertMessage");

  alertMessage.textContent = message; // 알림 메시지 설정
  alertBox.classList.remove("hidden"); // 팝업 표시
}

// 팝업 닫기 이벤트 설정
document.getElementById("alertCloseButton").addEventListener("click", () => {
  const alertBox = document.getElementById("customAlert");
  alertBox.classList.add("hidden"); // 팝업 숨김
});

// Add close functionality to the panel
document.getElementById("closePanel").addEventListener("click", () => {
  document.getElementById("chartPanel").classList.add("hidden");
});

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggleButton");

  // 사이드바 초기 상태 완전히 숨기기
  sidebar.classList.remove("open");
  toggleButton.innerText = "▶";
  toggleButton.style.left = "10px"; // 사이드바 닫혔을 때 버튼 위치

  // 토글 버튼 동작
  toggleButton.addEventListener("click", () => {
    const isOpen = sidebar.classList.contains("open");
    if (isOpen) {
      // 사이드바 닫기
      sidebar.classList.remove("open");
      toggleButton.innerText = "▶";
    } else {
      // 사이드바 열기
      sidebar.classList.add("open");
      toggleButton.innerText = "◀";
    }
    toggleButton.style.left = isOpen ? "10px" : `${sidebar.offsetWidth + 10}px`;
  });

  // 지도 및 데이터 로드
  initMap();
  loadAndGroupGeoJSON();
  loadClusteredTop10();
  loadMetadata();
  addResetButton();
});

/**
 * Converts HEX color values to RGBA with specified opacity.
 *
 * @param {string[]} hexColors - Array of HEX color values.
 * @param {number} opacity - Opacity value (0.0 to 1.0).
 * @returns {string[]} Array of RGBA color values.
 */
function hexToRgbaWithOpacity(hexColors, opacity) {
  return hexColors.map((hex) => {
    // Ensure the HEX color starts with "#" and remove it
    const sanitizedHex = hex.startsWith("#") ? hex.slice(1) : hex;

    // Convert HEX to RGB
    const r = parseInt(sanitizedHex.substring(0, 2), 16);
    const g = parseInt(sanitizedHex.substring(2, 4), 16);
    const b = parseInt(sanitizedHex.substring(4, 6), 16);

    // Return RGBA string
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  });
}
