export function registerServiceWorker() {
  // Register SW only in production-like builds; dev/IP over HTTP rarely triggers installability
  if (!import.meta.env.PROD) return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .catch((error) => console.error('SW registration failed', error));
    });
  }
}
