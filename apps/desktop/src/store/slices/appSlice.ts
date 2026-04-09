import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { THEME_STORAGE_KEY, readStoredTheme, type ThemeMode } from '../../lib/theme';

interface AppState {
  sidebarOpen: boolean;
  theme: ThemeMode;
}

const initialState: AppState = {
  sidebarOpen: true,
  theme: readStoredTheme(),
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.theme = action.payload;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      } catch {
        /* ignore */
      }
    },
  },
});

export const { toggleSidebar, setTheme } = appSlice.actions;
export default appSlice.reducer;
