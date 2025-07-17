


import React from 'react';

const Sidebar = ({ open, onClose, children }) => {
  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-80 bg-gray-800 text-white shadow-xl transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex justify-end p-4">
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white focus:outline-none"
          aria-label="Close sidebar"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-6 overflow-y-auto h-full">
        {children}
      </div>
    </div>
  );
};

export default Sidebar;


