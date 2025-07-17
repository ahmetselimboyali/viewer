
import React from 'react';
import Plot from 'react-plotly.js';

const ChartContainer = ({ data, layout, config, loading, error }) => {
  return (
    <div className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-10">
          <div className="text-white text-lg">Loading chart...</div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-50 z-10">
          <div className="text-white text-lg">Error: {error.message}</div>
        </div>
      )}

      <Plot
        data={data}
        layout={{
          ...layout,
          autosize: true,
          responsive: true
        }}
        config={{
          responsive: true,
          displayModeBar: true,
          ...config
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default ChartContainer;


