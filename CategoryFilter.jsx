import React, { useState, useEffect } from 'react';

const CategoryFilter = ({ onCategoryChange, activeCategory }) => {
  const categories = [
    { id: 'all', name: 'All' },
    { id: 'commercial', name: 'Commercial' },
    { id: 'design', name: 'Design' },
    { id: 'nature', name: 'Nature' },
    { id: 'people', name: 'People' },
    { id: 'photography', name: 'Photography' },
    { id: 'tech', name: 'Tech' },
    { id: 'travel', name: 'Travel' },
    { id: 'uncategorized', name: 'Uncategorized' }
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
      {categories.map((category) => (
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
