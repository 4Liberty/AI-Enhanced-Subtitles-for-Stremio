if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

function updateStatus() {
  fetch('/health')
    .then(response => response.json())
    .then(data => {
      updateServiceStatus('gateway-status', data.healthy);
      
      const services = data.services;
      if (services) {
        // This is a simplified view. A real app would iterate through services.
        updateServiceStatus('subtitle-status', services.healthy > 0);
        updateServiceStatus('ai-status', services.healthy > 0);
        updateServiceStatus('streaming-status', services.healthy > 0);
        updateServiceStatus('quality-status', services.healthy > 0);
      }
    })
    .catch(() => {
      updateServiceStatus('gateway-status', false);
    });
    
  fetch('/metrics')
    .then(response => response.json())
    .then(data => {
      document.getElementById('total-requests').textContent = data.gateway.totalRequests;
      document.getElementById('avg-response-time').textContent = `${data.gateway.averageResponseTime}ms`;
      // A bit of a simplification for cache hit rate
      // const cacheHitRate = (data.cache.hits / (data.cache.hits + data.cache.misses) * 100).toFixed(2);
      // document.getElementById('cache-hit-rate').textContent = `${cacheHitRate}%`;
    })
    .catch(err => console.error('Error fetching metrics:', err));
}

function updateServiceStatus(elementId, isHealthy) {
  const element = document.getElementById(elementId);
  const statusSpan = element.querySelector('span');
  statusSpan.textContent = isHealthy ? 'Healthy' : 'Unhealthy';
  statusSpan.className = isHealthy ? 'healthy' : 'unhealthy';
}

setInterval(updateStatus, 5000);
updateStatus();