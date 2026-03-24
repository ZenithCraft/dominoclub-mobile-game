import axios from 'axios';

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const adminApi = axios.create({
  baseURL: `${API}/admin`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach admin token from localStorage on every request
adminApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
adminApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
