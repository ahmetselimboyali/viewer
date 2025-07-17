

import { useMemo } from 'react';

// Export all data processing functions
export const movingAverage = (data, windowSize) => {
  return data.map((_, idx, arr) => {
    const start = Math.max(0, idx - windowSize + 1);
    const slice = arr.slice(start, idx + 1);
    const avg = slice.reduce((sum, val) => sum + val, 0) / slice.length;
    return avg;
  });
};

export const timeBasedMovingAverage = (dataPoints, hoursWindow) => {
  return dataPoints.map((point, idx) => {
    const currentTime = point.timestamp.getTime();
    const windowStart = currentTime - (hoursWindow * 60 * 60 * 1000);
    const windowPoints = dataPoints.filter((p, pIdx) =>
      pIdx <= idx && p.timestamp.getTime() >= windowStart
    );
    if (windowPoints.length === 0) return point.value;
    const avg = windowPoints.reduce((sum, p) => sum + p.value, 0) / windowPoints.length;
    return avg;
  });
};

export const makeRelativeToZero = (values) => {
  if (!values || values.length === 0) return values;
  let firstValidValue = null;
  for (let i = 0; i < values.length; i++) {
    const num = Number(values[i]);
    if (!isNaN(num)) {
      firstValidValue = num;
      break;
    }
  }
  if (firstValidValue === null) return values;
  return values.map(val => {
    const num = Number(val);
    return isNaN(num) ? val : num - firstValidValue;
  });
};

// Add other utility functions as needed

// Custom hook for common data processing
export const useDataProcessing = (data, selectedX, selectedY, smoothingOptions) => {
  return useMemo(() => {
    // Implement data processing logic here
    // This is just a placeholder implementation
    return {
      processedData: data,
      statistics: {}
    };
  }, [data, selectedX, selectedY, smoothingOptions]);
};

