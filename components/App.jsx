import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import Dashboard from './Dashboard';

function App() {
  return (
    <Router>
      <AdminLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/posts" element={<div className="p-6"><h1 className="text-2xl font-bold">Posts Management</h1><p>Manage your blog posts here.</p></div>} />
          <Route path="/settings" element={<div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p>Configure your blog settings.</p></div>} />
          <Route path="/analytics" element={<div className="p-6"><h1 className="text-2xl font-bold">Analytics</h1><p>View detailed analytics.</p></div>} />
        </Routes>
      </AdminLayout>
    </Router>
  );
}

export default App;
