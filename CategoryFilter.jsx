import React, { useState, useEffect } from 'react';

const CategoryFilter = ({ onCategoryChange, activeCategory, categories = [] }) => {
  // Add "All" category and merge with dynamic categories
  const allCategories = [
    { id: 'all', name: 'All', slug: 'all', description: 'All posts' },
    ...categories
  ];

  const [localActiveCategory, setLocalActiveCategory] = useState(activeCategory || 'all');

  useEffect(() => {
    setLocalActiveCategory(activeCategory || 'all');
  }, [activeCategory]);

  const handleCategoryClick = (categoryId) => {
    const newCategory = localActiveCategory === categoryId ? 'all' : categoryId;
    setLocalActiveCategory(newCategory);
    onCategoryChange(newCategory);
  };

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {allCategories.map((category) => (
        <button
          key={category.id}
          onClick={() => handleCategoryClick(category.id)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
            localActiveCategory === category.id
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
};

export default CategoryFilter;
