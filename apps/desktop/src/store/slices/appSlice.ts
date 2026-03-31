import { createSlice } from '@reduxjs/toolkit';

interface AppState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
}

const initialState: AppState = {
  sidebarOpen: true,
  theme: 'light',
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
  },
});

export const { toggleSidebar, setTheme } = appSlice.actions;
export default appSlice.reducer;
