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
db.run(`
  CREATE TABLE IF NOT EXISTS datos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device TEXT,
    time INTEGER,
    station TEXT,
    data TEXT,
    rssi TEXT,
    seq TEXT,
    type TEXT
  )
`);

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

  db.run(`
    INSERT INTO datos (device, time, station, data, rssi, seq, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [device, time, station, formattedData, formattedRssi, formattedSeq, formattedType], (err) => {
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

// Ruta principal con dashboard mejorado
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard LokaRCZ2 SigFox</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f8f9fa;
        padding-top: 20px;
      }
      .card {
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
        transition: transform 0.3s;
        overflow: hidden;
      }
      .card:hover {
        transform: translateY(-5px);
      }
      .card-header {
        background-color: #4a6fdc;
        color: white;
        font-weight: bold;
        border-radius: 10px 10px 0 0 !important;
      }
      #map {
        height: 400px;
        border-radius: 5px;
      }
      .data-value {
        font-size: 1.8rem;
        font-weight: bold;
        color: #343a40;
      }
      .data-label {
        color: #6c757d;
        font-size: 0.9rem;
        text-transform: uppercase;
      }
      .refresh-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }
      .table-responsive {
        border-radius: 5px;
        overflow: hidden;
      }
      .bg-gradient {
        background: linear-gradient(135deg, #4a6fdc 0%, #6c5ce7 100%);
      }
      .text-primary {
        color: #4a6fdc !important;
      }
      #lastUpdate {
        font-size: 0.8rem;
        color: #6c757d;
      }
      .pulse-animation {
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(40, 167, 69, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(40, 167, 69, 0);
        }
      }

      .bg-gradient .card-body {
        background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxkZWZzPjxwYXR0ZXJuIGlkPSJwYXR0ZXJuIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iMjAiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNwYXR0ZXJuKSIvPjwvc3ZnPg==');
        background-size: cover;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="row mb-4">
        <div class="col-12">
          <div class="card bg-gradient text-white">
            <div class="card-body p-4">
              <div class="row align-items-center">
                <div class="col-md-2 text-center mb-3 mb-md-0">
                  <img src="https://cdn-icons-png.flaticon.com/512/2885/2885417.png" alt="SigFox Logo" class="img-fluid" style="max-height: 80px;">
                </div>
                <div class="col-md-8">
                  <h1 class="display-5 fw-bold">Dashboard LokaRCZ2 SigFox</h1>
                  <p class="lead">Monitoreo en tiempo real de dispositivos IoT</p>
                  <div class="d-flex align-items-center">
                    <div class="me-2">
                      <span class="badge bg-success pulse-animation">En línea</span>
                    </div>
                    <p id="lastUpdate" class="mb-0 text-light">
                      <i class="bi bi-clock-history"></i> Última actualización: 
                      <span id="updateTime" class="fw-bold">Cargando...</span>
                    </p>
                  </div>
                </div>
                <div class="col-md-2 text-center">
                  <div class="rounded-circle bg-white text-primary p-3 d-inline-flex justify-content-center align-items-center" style="width: 70px; height: 70px;">
                    <span id="deviceCount" class="h2 mb-0">--</span>
                  </div>
                  <p class="text-white mt-2 mb-0">Dispositivos</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col-md-8">
          <div class="card">
            <div class="card-header">Ubicación del Dispositivo</div>
            <div class="card-body">
              <div id="map"></div>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="card">
            <div class="card-header">Información del Dispositivo</div>
            <div class="card-body">
              <div class="mb-3">
                <div class="data-label">ID del Dispositivo</div>
                <div class="data-value" id="deviceId">--</div>
              </div>
              <div class="mb-3">
                <div class="data-label">Estación</div>
                <div class="data-value" id="station">--</div>
              </div>
              <div class="mb-3">
                <div class="data-label">RSSI</div>
                <div class="data-value" id="rssi">--</div>
              </div>
              <div class="mb-3">
                <div class="data-label">Secuencia</div>
                <div class="data-value" id="sequence">--</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row mt-4">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">Temperatura (últimas 10 lecturas)</div>
            <div class="card-body">
              <canvas id="temperatureChart"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">Datos en Tiempo Real</div>
            <div class="card-body">
              <div class="row">
                <div class="col-6 mb-3">
                  <div class="data-label">Temperatura</div>
                  <div class="data-value text-primary" id="temperature">--</div>
                </div>
                <div class="col-6 mb-3">
                  <div class="data-label">Humedad</div>
                  <div class="data-value text-primary" id="humidity">--</div>
                </div>
                <div class="col-6 mb-3">
                  <div class="data-label">Batería</div>
                  <div class="data-value text-primary" id="battery">--</div>
                </div>
                <div class="col-6 mb-3">
                  <div class="data-label">Datos (Hex)</div>
                  <div class="data-value text-primary" id="rawData">--</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="row mt-4">
        <div class="col-12">
          <div class="card">
            <div class="card-header">Historial de Datos</div>
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

    <button class="btn btn-primary btn-lg rounded-circle refresh-btn" onclick="loadData()">
      <i class="bi bi-arrow-clockwise"></i> 🔄
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
          .bindPopup('Dispositivo LokaRCZ2')
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
              borderColor: '#4a6fdc',
              backgroundColor: 'rgba(74, 111, 220, 0.1)',
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

      // Convertir datos hexadecimales a decimales
      function hexToDecimal(hex) {
        return parseInt(hex, 16);
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
        document.getElementById('station').textContent = lastData.station || '--';
        document.getElementById('rssi').textContent = lastData.rssi || '--';
        document.getElementById('sequence').textContent = lastData.seq || '--';
        
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
        document.getElementById('rawData').textContent = rawDataHex;
        
        // Interpretar los datos hexadecimales
        const parsedData = parseHexData(rawDataHex);
        
        // Actualizar valores en tiempo real
        document.getElementById('temperature').textContent = 
          parsedData.temperature !== null ? parsedData.temperature.toFixed(1) + ' °C' : '--';
        document.getElementById('humidity').textContent = 
          parsedData.humidity !== null ? parsedData.humidity.toFixed(1) + ' %' : '--';
        document.getElementById('battery').textContent = 
          parsedData.battery !== null ? parsedData.battery.toFixed(2) + ' V' : '--';
        
        // Actualizar mapa
        if (map && marker) {
          marker.setLatLng([parsedData.latitude, parsedData.longitude]);
          map.setView([parsedData.latitude, parsedData.longitude], 13);
          marker.bindPopup(\`Dispositivo: \${lastData.device}<br>Temperatura: \${parsedData.temperature ? parsedData.temperature.toFixed(1) + ' °C' : '--'}<br>Última actualización: \${lastData.timeFormatted}\`).openPopup();
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
            dataDisplay = \`Hex: \${dataDisplay}<br>Temp: \${parsedData.temperature !== null ? parsedData.temperature.toFixed(1) + '°C' : '--'}, Hum: \${parsedData.humidity !== null ? parsedData.humidity.toFixed(1) + '%' : '--'}\`;
            
          } catch (e) {
            dataDisplay = 'Error al procesar datos';
          }
          
          row.innerHTML = \`
            <td>\${item.id}</td>
            <td>\${item.timeFormatted}</td>
            <td>\${item.device}</td>
            <td>\${dataDisplay}</td>
            <td>\${item.rssi}</td>
            <td>\${item.seq}</td>
          \`;
          
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
