const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// Iniciar servidor Express
const app = express();
const port = process.env.PORT || 3000;
// Configurar body-parser para recibir datos JSON y datos urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Configurar la base de datos SQLite
const db = new sqlite3.Database('sigfox.db', (err) => {
if (err) {
console.error('Error al conectar a la base de datos:', err.message);
} else {
console.log('Conectado a la base de datos SQLite');
}
});
// Crear la tabla 'datos' si no existe
db.run(`CREATE TABLE IF NOT EXISTS datos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device TEXT,
    time INTEGER,
    station TEXT,
    data TEXT,
    rssi TEXT,
    seq TEXT,
    type TEXT
  )`);
// Función para convertir datos hexadecimales a decimales
function hexToDecimal(hex) {
return parseInt(hex, 16);
}
// Ruta para recibir el callback de Sigfox y guardar los datos
app.post('/callback', (req, res) => {
const { device, time, station, data, rssi, seq, type } = req.body;
// Imprimir el callback recibido en la consola del servidor
console.log('📥 Callback recibido:', req.body);
// Asegurándonos de que los datos sean correctamente formateados
const formattedData = JSON.stringify(data);
const formattedRssi = rssi ? rssi.toString() : 'N/A';
const formattedSeq = seq ? seq.toString() : 'N/A';
const formattedType = type ? type.toString() : 'N/A';
db.run(`INSERT INTO datos (device, time, station, data, rssi, seq, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [device, time, station, formattedData, formattedRssi, formattedSeq, formattedType], (err) => {
if (err) {
console.error('❌ Error al guardar en la base de datos:', err.message);
return res.status(500).send('Error');
}
console.log('✅ Callback recibido y guardado');
res.status(200).send('OK');
});
});
// Ruta para obtener los datos en formato JSON (para los gráficos)
app.get('/api/datos', (req, res) => {
db.all('SELECT * FROM datos ORDER BY time DESC LIMIT 50', (err, rows) => {
if (err) return res.status(500).json({ error: 'Error al cargar datos' });
// Procesar los datos para el cliente
const processedData = rows.map(row => {
  let dataObj;
  try {
    dataObj = JSON.parse(row.data);
  } catch (e) {
    dataObj = { raw: row.data };
  }
  
  return {
    id: row.id,
    device: row.device,
    time: parseInt(row.time) * 1000, // Convertir a milisegundos para JavaScript
    timeFormatted: new Date(parseInt(row.time) * 1000).toLocaleString(),
    station: row.station,
    data: dataObj,
    rssi: row.rssi,
    seq: row.seq,
    type: row.type
  };
});

res.json(processedData);

});
});
// Ruta principal con dashboard simplificado
app.get('/', (req, res) => {
const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard de Monitoreo de Ganado</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    #map { height: 400px; width: 100%; }
    .refresh-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      width: 60px;
      height: 60px;
      font-size: 24px;
    }
    .alert-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      width: 300px;
    }
    .alert {
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
<div class="container-fluid p-4">
  <div class="row mb-4">
    <div class="col-12">
      <h1 class="text-center text-success">Dashboard de Monitoreo de Ganado</h1>
      <p class="text-center">Última actualización: <span id="updateTime">--</span></p>
      <p class="text-center">Dispositivos activos: <span id="deviceCount" class="badge bg-success">0</span></p>
    </div>
  </div>

  <!-- Contenedor de alertas -->
  <div class="alert-container" id="alertContainer"></div>

  <!-- Mapa y datos básicos -->
  <div class="row">
    <div class="col-md-8">
      <div class="card">
        <div class="card-header bg-success text-white">Ubicación del Ganado</div>
        <div class="card-body">
          <div id="map"></div>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card">
        <div class="card-header bg-success text-white">Datos en Tiempo Real</div>
        <div class="card-body">
          <div class="mb-3">
            <strong>ID del Dispositivo:</strong>
            <div id="deviceId" class="fs-5">--</div>
          </div>
          <div class="mb-3">
            <strong>Temperatura:</strong>
            <div id="temperature" class="fs-5">--</div>
            <div id="temperatureAlert" class="mt-1"></div>
          </div>
          <div class="mb-3">
            <strong>Humedad:</strong>
            <div id="humidity" class="fs-5">--</div>
            <div id="humidityAlert" class="mt-1"></div>
          </div>
          <div class="mb-3">
            <strong>Batería:</strong>
            <div id="battery" class="fs-5">--</div>
            <div id="batteryAlert" class="mt-1"></div>
          </div>
          <div class="mb-3">
            <strong>RSSI:</strong>
            <div id="rssi" class="fs-5">--</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Gráfico de temperatura -->
  <div class="row mt-4">
    <div class="col-12">
      <div class="card">
        <div class="card-header bg-success text-white">Temperatura (últimas 10 lecturas)</div>
        <div class="card-body">
          <canvas id="temperatureChart"></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabla de historial -->
  <div class="row mt-4">
    <div class="col-12">
      <div class="card">
        <div class="card-header bg-success text-white">Historial de Datos</div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-striped table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha/Hora</th>
                  <th>Dispositivo</th>
                  <th>Datos</th>
                  <th>RSSI</th>
                  <th>Secuencia</th>
                </tr>
              </thead>
              <tbody id="dataTable">
                <tr>
                  <td colspan="6" class="text-center">Cargando datos...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<button class="btn btn-success btn-lg rounded-circle refresh-btn" onclick="loadData()">
  🔄
</button>

<script>
  // Variables globales
  let map;
  let marker;
  let temperatureChart;
  let allData = [];

  // Inicializar mapa
  function initMap() {
    map = L.map('map').setView([19.432608, -99.133209], 13); // Coordenadas de México por defecto
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Marcador inicial (se actualizará con datos reales)
    marker = L.marker([19.432608, -99.133209]).addTo(map)
      .bindPopup('Ganado')
      .openPopup();
  }

  // Inicializar gráfico de temperatura
  function initTemperatureChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Temperatura (°C)',
          data: [],
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          }
        },
        scales: {
          y: {
            beginAtZero: false
          }
        }
      }
    });
  }

  // Mostrar alertas
  function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertContainer.appendChild(alertDiv);
    
    // Eliminar la alerta después de 10 segundos
    setTimeout(() => {
      alertDiv.remove();
    }, 10000);
  }

  // Cargar datos desde la API
  function loadData() {
    fetch('/api/datos')
      .then(response => response.json())
      .then(data => {
        allData = data;
        updateDashboard();
        document.getElementById('updateTime').textContent = new Date().toLocaleString();
      })
      .catch(error => console.error('Error al cargar datos:', error));
  }
  
  // Extraer bytes específicos del string hexadecimal y convertirlos a valores reales
  function parseHexData(hexString) {
    // Eliminar cualquier carácter no hexadecimal
    hexString = hexString.replace(/[^0-9A-Fa-f]/g, '');
    
    // Para un formato típico de SigFox, ajustamos la interpretación:
    // Ejemplo de formato: primeros 2 bytes (4 caracteres) para temperatura
    let result = {
      temperature: null,
      humidity: null,
      battery: null,
      latitude: 19.432608,  // Valor por defecto
      longitude: -99.133209 // Valor por defecto
    };
    
    try {
      if (hexString.length >= 4) {
        // Temperatura: Primeros 2 bytes (convertidos a signed int y divididos por 10)
        let tempHex = hexString.substring(0, 4);
        let tempValue = parseInt(tempHex, 16);
        // Si el valor es signed y el bit más significativo está activado
        if (tempValue > 0x7FFF) {
          tempValue = tempValue - 0x10000;
        }
        result.temperature = tempValue / 10;
        
        // Humedad: Siguientes 2 bytes (convertidos a unsigned int y divididos por 10)
        if (hexString.length >= 8) {
          let humHex = hexString.substring(4, 8);
          let humValue = parseInt(humHex, 16);
          result.humidity = humValue / 10;
          
          // Batería: Siguientes 2 bytes (convertidos a unsigned int y divididos por 1000)
          if (hexString.length >= 12) {
            let batHex = hexString.substring(8, 12);
            let batValue = parseInt(batHex, 16);
            result.battery = batValue / 1000;
            
            // Coordenadas (si están disponibles)
            if (hexString.length >= 20) {
              // Latitud: 4 bytes siguientes
              let latHex = hexString.substring(12, 20);
              let latValue = parseInt(latHex, 16);
              if (latValue > 0x7FFFFFFF) {
                latValue = latValue - 0x100000000;
              }
              result.latitude = latValue / 1000000;
              
              // Longitud: últimos 4 bytes
              if (hexString.length >= 28) {
                let lonHex = hexString.substring(20, 28);
                let lonValue = parseInt(lonHex, 16);
                if (lonValue > 0x7FFFFFFF) {
                  lonValue = lonValue - 0x100000000;
                }
                result.longitude = lonValue / 1000000;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error al analizar datos hexadecimales:', e);
    }
    
    return result;
  }

  // Actualizar el dashboard con los datos recibidos
  function updateDashboard() {
    if (allData.length === 0) return;
    
    // Obtener el último registro
    const lastData = allData[0];
    
    // Actualizar información del dispositivo
    document.getElementById('deviceId').textContent = lastData.device || '--';
    document.getElementById('rssi').textContent = lastData.rssi || '--';
    
    // Actualizar contador de dispositivos
    document.getElementById('deviceCount').textContent = new Set(allData.map(item => item.device)).size;
    
    // Procesar datos en bruto
    let rawDataHex = '';
    if (typeof lastData.data === 'object' && lastData.data !== null) {
      rawDataHex = JSON.stringify(lastData.data);
    } else if (typeof lastData.data === 'string') {
      try {
        rawDataHex = JSON.parse(lastData.data);
      } catch (e) {
        rawDataHex = lastData.data;
      }
    }
    
    // Limpiar el string hexadecimal (quitar comillas, etc.)
    rawDataHex = rawDataHex.replace(/["']/g, '');
    
    // Interpretar los datos hexadecimales
    const parsedData = parseHexData(rawDataHex);
    
    // Actualizar valores en tiempo real
    document.getElementById('temperature').textContent = 
      parsedData.temperature !== null ? parsedData.temperature.toFixed(1) + ' °C' : '--';
    document.getElementById('humidity').textContent = 
      parsedData.humidity !== null ? parsedData.humidity.toFixed(1) + ' %' : '--';
    document.getElementById('battery').textContent = 
      parsedData.battery !== null ? parsedData.battery.toFixed(2) + ' V' : '--';
    
    // Verificar alertas de temperatura
    if (parsedData.temperature !== null) {
      const tempElement = document.getElementById('temperatureAlert');
      if (parsedData.temperature < 1650) {
        tempElement.innerHTML = '<div class="alert alert-warning p-1 m-0">Advertencia: Temperatura baja</div>';
        showAlert(`Temperatura baja: ${parsedData.temperature.toFixed(1)} °C`, 'warning');
      } else if (parsedData.temperature > 1700) {
        tempElement.innerHTML = '<div class="alert alert-danger p-1 m-0">Advertencia: Temperatura alta</div>';
        showAlert(`Temperatura alta: ${parsedData.temperature.toFixed(1)} °C`, 'danger');
      } else {
        tempElement.innerHTML = '';
      }
    }
    
    // Verificar alertas de humedad
    if (parsedData.humidity !== null) {
      const humElement = document.getElementById('humidityAlert');
      if (parsedData.humidity < 1200) {
        humElement.innerHTML = '<div class="alert alert-warning p-1 m-0">Advertencia: Humedad baja</div>';
        showAlert(`Humedad baja: ${parsedData.humidity.toFixed(1)} %`, 'warning');
      } else if (parsedData.humidity > 2200) {
        humElement.innerHTML = '<div class="alert alert-danger p-1 m-0">Advertencia: Humedad alta</div>';
        showAlert(`Humedad alta: ${parsedData.humidity.toFixed(1)} %`, 'danger');
      } else {
        humElement.innerHTML = '';
      }
    }
    
    // Verificar alertas de batería
    if (parsedData.battery !== null) {
      const batElement = document.getElementById('batteryAlert');
      if (parsedData.battery < 50) {
        batElement.innerHTML = '<div class="alert alert-danger p-1 m-0">Advertencia: Batería baja</div>';
        showAlert(`Batería baja: ${parsedData.battery.toFixed(2)} V`, 'danger');
      } else {
        batElement.innerHTML = '';
      }
    }
    
    // Actualizar mapa
    if (map && marker) {
      marker.setLatLng([parsedData.latitude, parsedData.longitude]);
      map.setView([parsedData.latitude, parsedData.longitude], 13);
      marker.bindPopup(`Ganado: ${lastData.device}<br>Temperatura: ${parsedData.temperature ? parsedData.temperature.toFixed(1) + ' °C' : '--'}<br>Última actualización: ${lastData.timeFormatted}`).openPopup();
    }
    
    // Actualizar gráfico de temperatura
    updateTemperatureChart();
    
    // Actualizar tabla de historial
    updateDataTable();
  }

  // Actualizar gráfico de temperatura
  function updateTemperatureChart() {
    if (!temperatureChart || allData.length === 0) return;
    
    // Obtener los últimos 10 registros (o menos si no hay suficientes)
    const chartData = allData.slice(0, 10).reverse();
    
    const labels = chartData.map(item => {
      const date = new Date(item.time);
      return date.toLocaleTimeString();
    });
    
    const temperatures = chartData.map(item => {
      // Extraer temperatura de los datos
      let rawDataHex = '';
      if (typeof item.data === 'object' && item.data !== null) {
        rawDataHex = JSON.stringify(item.data);
      } else if (typeof item.data === 'string') {
        try {
          rawDataHex = JSON.parse(item.data);
        } catch (e) {
          rawDataHex = item.data;
        }
      }
      
      // Limpiar el string hexadecimal
      rawDataHex = rawDataHex.replace(/["']/g, '');
      
      // Interpretar los datos
      const parsedData = parseHexData(rawDataHex);
      return parsedData.temperature || null;
    });
    
    temperatureChart.data.labels = labels;
    temperatureChart.data.datasets[0].data = temperatures;
    temperatureChart.update();
  }

  // Actualizar tabla de historial
  function updateDataTable() {
    const tableBody = document.getElementById('dataTable');
    tableBody.innerHTML = '';
    
    allData.forEach(item => {
      const row = document.createElement('tr');
      
      let dataDisplay = '';
      try {
        if (typeof item.data === 'object' && item.data !== null) {
          dataDisplay = JSON.stringify(item.data);
        } else {
          dataDisplay = item.data;
        }
        
        // Limpiar el string
        dataDisplay = dataDisplay.replace(/["']/g, '');
        
        // Interpretar los datos para mostrar valores más legibles
        const parsedData = parseHexData(dataDisplay);
        dataDisplay = `Temp: ${parsedData.temperature !== null ? parsedData.temperature.toFixed(1) + '°C' : '--'}, Hum: ${parsedData.humidity !== null ? parsedData.humidity.toFixed(1) + '%' : '--'}`;
        
      } catch (e) {
        dataDisplay = 'Error al procesar datos';
      }
      
      row.innerHTML = `
        <td>${item.id}</td>
        <td>${item.timeFormatted}</td>
        <td>${item.device}</td>
        <td>${dataDisplay}</td>
        <td>${item.rssi}</td>
        <td>${item.seq}</td>
      `;
      
      tableBody.appendChild(row);
    });
  }

  // Inicializar todo al cargar la página
  document.addEventListener('DOMContentLoaded', function() {
    initMap();
    initTemperatureChart();
    loadData();
    
    // Actualizar datos cada 60 segundos
    setInterval(loadData, 60000);
  });
</script>
</body>
</html>
`;

res.send(html);
});
// Ruta para ver los datos de la base de datos (versión anterior)
app.get('/ver-db', (req, res) => {
db.all('SELECT * FROM datos', (err, rows) => {
if (err) return res.status(500).send('Error al cargar datos');
let html = `<h1>Datos en la Base de Datos</h1>
<table border="1" cellpadding="5" cellspacing="0">
  <tr><th>ID</th><th>Device</th><th>Time</th><th>Station</th><th>Data</th><th>RSSI</th><th>Seq</th><th>Type</th></tr>`;

rows.forEach(row => {
  // Convertimos el 'data' JSON a texto si es necesario
  let data = JSON.parse(row.data);
  let formattedData = data ? JSON.stringify(data) : 'No data';
  
  html += `<tr>
    <td>${row.id}</td>
    <td>${row.device}</td>
    <td>${new Date(parseInt(row.time) * 1000).toLocaleString()}</td>
    <td>${row.station}</td>
    <td>${formattedData}</td>
    <td>${row.rssi}</td>
    <td>${row.seq}</td>
    <td>${row.type}</td>
  </tr>`;
});

html += `</table>`;
res.send(html);

});
});
// Iniciar el servidor
app.listen(port, () => {
console.log(`Servidor corriendo en http://localhost:${port}`);
});
