import SidebarItem from './SidebarItem';
import { LayoutDashboard, FileText, Users, Tag, BarChart3, Settings, LogOut } from 'lucide-react';

export default function Sidebar() {
  const navigation = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/posts", icon: FileText, label: "Posts" },
    { to: "/users", icon: Users, label: "Users" },
    { to: "/categories", icon: Tag, label: "Categories" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-60 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-600">Blog Management</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-1">
          {navigation.map((item) => (
            <SidebarItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <button className="flex items-center gap-3 px-4 py-2 w-full text-left text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer">
          <span className="w-4 h-4">Logout</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
