import axios from 'axios';
import useAuthStore from '../store/useAuthStore';

// Determine API base URL:
// 1) VITE_API_BASE_URL if provided
// 2) Otherwise current origin + /api (works on LAN/mobile when frontend is hosted)
const defaultBase =
  typeof window !== 'undefined'
    ? `${window.location.origin.replace(/\/$/, '')}/api`
    : 'http://localhost:5000/api';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultBase,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
client.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - logout user
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
