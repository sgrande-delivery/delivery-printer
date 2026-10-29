import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginScreen from 'renderer/screens/LoginScreen';
import MainScreen from 'renderer/screens/MainScreen';
import PrintQueueScreen from 'renderer/screens/PrintQueueScreen';
import HistoryScreen from 'renderer/screens/HistoryScreen';
import PrintersScreen from 'renderer/screens/PrintersScreen';
import PrinterSettingsScreen from 'renderer/screens/PrinterSettingsScreen';
import PrintTestScreen from 'renderer/screens/PrintTestScreen';
import PublicRoute from './PublicRoute';
import ProtectedRoute from './ProtectedRoute';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute element={<LoginScreen />} />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<MainScreen />} />
        <Route path="/queue" element={<PrintQueueScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/printers" element={<PrintersScreen />} />
        <Route path="/printer-settings" element={<PrinterSettingsScreen />} />
        <Route path="/print-test" element={<PrintTestScreen />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
