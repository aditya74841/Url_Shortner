import { create } from 'zustand';
import api from '../lib/axios';

export const useUrlStore = create((set, get) => ({
  urls: [],
  recentUrl: null,
  analyticsData: null,
  isAnalyticsOpen: false,
  analyticsLoading: false,
  loading: false,
  error: null,
  copySuccessId: null,

  setCopySuccessId: (id) => {
    set({ copySuccessId: id });
    setTimeout(() => set({ copySuccessId: null }), 2000);
  },

  clearError: () => set({ error: null }),

  fetchUrls: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/api/v1/urls');
      if (response.data?.data?.urls) {
        set({ urls: response.data.data.urls, loading: false });
      } else {
        set({ urls: [], loading: false });
      }
    } catch (err) {
      console.error('Fetch URLs Error:', err);
      set({ error: err.response?.data?.message || 'Failed to fetch URLs', loading: false });
    }
  },

  createShortUrl: async (fullUrl) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/api/v1/urls', { fullUrl });
      const newUrlData = response.data?.data;
      if (newUrlData) {
        set((state) => ({
          urls: [newUrlData, ...state.urls.filter((u) => u.short !== newUrlData.short)],
          recentUrl: newUrlData,
          loading: false,
        }));
        return newUrlData;
      }
    } catch (err) {
      console.error('Create URL Error:', err);
      const errMsg = err.response?.data?.message || 'Failed to shorten URL. Make sure it is valid.';
      set({ error: errMsg, loading: false });
      throw new Error(errMsg);
    }
  },

  fetchAnalytics: async (shortCode) => {
    set({ analyticsLoading: true, isAnalyticsOpen: true, analyticsData: null });
    try {
      const response = await api.get(`/api/v1/urls/${shortCode}/analytics`);
      if (response.data?.data) {
        set({ analyticsData: response.data.data, analyticsLoading: false });
      }
    } catch (err) {
      console.error('Fetch Analytics Error:', err);
      set({
        error: err.response?.data?.message || 'Failed to load analytics',
        analyticsLoading: false,
      });
    }
  },

  closeAnalytics: () => set({ isAnalyticsOpen: false, analyticsData: null }),
}));
