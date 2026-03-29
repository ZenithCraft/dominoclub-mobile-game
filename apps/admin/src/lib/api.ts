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
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }

    if (
      !error.response &&
      typeof window !== 'undefined' &&
      typeof adminApi.defaults.baseURL === 'string' &&
      adminApi.defaults.baseURL.includes('localhost:3001')
    ) {
      const cfg = error.config as any;
      if (!cfg?._fallbackRetried) {
        const nextBaseURL = adminApi.defaults.baseURL.replace('localhost:3001', 'localhost:3002');
        adminApi.defaults.baseURL = nextBaseURL;
        cfg._fallbackRetried = true;
        cfg.baseURL = nextBaseURL;
        return adminApi.request(cfg);
      }
    }

    return Promise.reject(error);
  }
);
