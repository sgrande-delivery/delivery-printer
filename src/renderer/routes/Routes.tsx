import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginScreen from 'renderer/screens/LoginScreen';
import MainScreen from 'renderer/screens/MainScreen';
import PrintersScreen from 'renderer/screens/PrintersScreen';
import PrinterSettingsScreen from 'renderer/screens/PrinterSettingsScreen';
import PublicRoute from './PublicRoute';
import ProtectedRoute from './ProtectedRoute';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute element={<LoginScreen />} />} />
      <Route path="/" element={<ProtectedRoute element={<MainScreen />} />} />
      <Route path="/printers" element={<ProtectedRoute element={<PrintersScreen />} />} />
      <Route path="/printer-settings" element={<ProtectedRoute element={<PrinterSettingsScreen />} />} />
    </Routes>
  );
};

export default AppRoutes;
