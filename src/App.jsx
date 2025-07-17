import React, { useState, useCallback, useEffect, useMemo } from "react";
import Papa from "papaparse";
import Plot from "react-plotly.js";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Utility functions
function movingAverage(data, windowSize) {
  return data.map((_, idx, arr) => {
    const start = Math.max(0, idx - windowSize + 1);
    const slice = arr.slice(start, idx + 1);
    const avg = slice.reduce((sum, val) => sum + val, 0) / slice.length;
    return avg;
  });
}

function timeBasedMovingAverage(dataPoints, hoursWindow) {
  return dataPoints.map((point, idx) => {
    const currentTime = point.timestamp.getTime();
    const windowStart = currentTime - (hoursWindow * 60 * 60 * 1000); // Convert hours to milliseconds

    // Find all points within the time window
    const windowPoints = dataPoints.filter((p, pIdx) =>
      pIdx <= idx && p.timestamp.getTime() >= windowStart
    );

    if (windowPoints.length === 0) return point.value;

    const avg = windowPoints.reduce((sum, p) => sum + p.value, 0) / windowPoints.length;
    return avg;
  });
}

// This function is completely rewritten to ensure it works correctly
function makeRelativeToZero(values) {
  if (!values || values.length === 0) return values;

  // Find first valid number to use as baseline
  let firstValidValue = null;
  for (let i = 0; i < values.length; i++) {
    const num = Number(values[i]);
    if (!isNaN(num)) {
      firstValidValue = num;
      break;
    }
  }

  // If no valid numbers found, return original array
  if (firstValidValue === null) return values;

  // Make a deep copy and subtract the first value from all values
  return values.map(val => {
    const num = Number(val);
    return isNaN(num) ? val : num - firstValidValue;
  });
}

function calculateStatistics(data) {
  if (data.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0, count: 0 };
  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: mean.toFixed(4),
    stdDev: stdDev.toFixed(4),
    min: Math.min(...data).toFixed(4),
    max: Math.max(...data).toFixed(4),
    median: sorted[Math.floor(sorted.length / 2)].toFixed(4),
    count: data.length
  };
}

// Smart Auto-Scale Functions
function calculateOptimalDateRange(data, xColumn, convertTimestamp) {
  if (!data.length) return { start: null, end: null };

  const dates = data.map(row => {
    const val = row[xColumn];
    return convertTimestamp(val);
  }).filter(d => d && !isNaN(d.getTime())).sort((a, b) => a - b);

  if (!dates.length) return { start: null, end: null };

  const range = dates[dates.length - 1] - dates[0];
  const padding = range * 0.05; // 5% padding

  return {
    start: new Date(dates[0].getTime() - padding),
    end: new Date(dates[dates.length - 1].getTime() + padding)
  };
}

function calculateOptimalDataRange(values) {
  if (!values.length) return { min: 0, max: 1 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const padding = range * 0.1; // 10% padding

  return {
    min: min - padding,
    max: max + padding
  };
}

function detectDataPatterns(data, columns) {
  const patterns = {};

  columns.forEach(col => {
    const values = data.map(row => parseFloat(row[col])).filter(val => !isNaN(val));
    if (values.length === 0) return;

    const stats = calculateStatistics(values);
    const range = parseFloat(stats.max) - parseFloat(stats.min);
    const cv = parseFloat(stats.stdDev) / parseFloat(stats.mean); // Coefficient of variation

    patterns[col] = {
      volatility: cv > 0.5 ? 'high' : cv > 0.2 ? 'medium' : 'low',
      trend: detectTrend(values),
      seasonality: detectSeasonality(values),
      outliers: detectOutliers(values),
      range: range,
      scale: range > 1000 ? 'large' : range > 100 ? 'medium' : 'small'
    };
  });

  return patterns;
}

function detectTrend(values) {
  if (values.length < 3) return 'none';

  let increasing = 0, decreasing = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) increasing++;
    else if (values[i] < values[i - 1]) decreasing++;
  }

  const total = values.length - 1;
  if (increasing / total > 0.7) return 'increasing';
  if (decreasing / total > 0.7) return 'decreasing';
  return 'stable';
}

function detectSeasonality(values) {
  // Simple seasonality detection based on periodicity
  if (values.length < 12) return false;

  const periods = [7, 12, 24, 30]; // Common periods
  for (const period of periods) {
    if (values.length >= period * 2) {
      let correlation = 0;
      const cycles = Math.floor(values.length / period);

      for (let i = 0; i < period && cycles > 1; i++) {
        const cycleValues = [];
        for (let j = 0; j < cycles; j++) {
          if (i + j * period < values.length) {
            cycleValues.push(values[i + j * period]);
          }
        }

        if (cycleValues.length > 1) {
          const mean = cycleValues.reduce((a, b) => a + b) / cycleValues.length;
          const variance = cycleValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / cycleValues.length;
          if (variance < mean * 0.1) correlation++; // Low variance indicates pattern
        }
      }

      if (correlation / period > 0.6) return period;
    }
  }

  return false;
}

function detectOutliers(values) {
  if (values.length < 4) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return values.map((val, idx) => ({
    index: idx,
    value: val,
    isOutlier: val < lowerBound || val > upperBound
  })).filter(item => item.isOutlier);
}

const CHART_TYPES = {
  LINE: 'line',
  SCATTER: 'scatter',
  BAR: 'bar',
  HISTOGRAM: 'histogram',
  BOX: 'box',
  DUAL_AXIS: 'dual_axis'
};

const COLOR_PALETTE = [
  '#038357', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#FF8A80', '#80CBC4', '#81C784', '#FFB74D', '#F06292',
  '#9575CD', '#64B5F6', '#4DB6AC', '#AED581', '#FFD54F',
  '#A1887F', '#90A4AE', '#EF5350', '#26A69A', '#66BB6A',
  '#FFA726', '#EC407A', '#AB47BC', '#42A5F5', '#26C6DA'
];

export default function App() {
  const [data, setData] = useState([]);
  const [pointOptions, setPointOptions] = useState([]);
  const [selectedPoints, setSelectedPoints] = useState([]);
  const [selectedY, setSelectedY] = useState("Easting");
  const [selectedY2, setSelectedY2] = useState("Northing"); // Second Y-axis for dual axis
  const [selectedX, setSelectedX] = useState("Epoch");
  const [chartType, setChartType] = useState(CHART_TYPES.LINE);
  const [showSmooth, setShowSmooth] = useState(false);
  const [smoothingWindow, setSmoothingWindow] = useState(5);
  const [smoothingType, setSmoothingType] = useState('count'); // 'count' or 'time'
  const [smoothingHours, setSmoothingHours] = useState(24);
  const [relativeToZero, setRelativeToZero] = useState(false);
  const [recentFiles, setRecentFiles] = useState(() => {
    const saved = localStorage.getItem('asb-viewer-recent-files');
    return saved ? JSON.parse(saved) : [];
  });
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showStatistics, setShowStatistics] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [dataColumns, setDataColumns] = useState([]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Auto-scale and AI features
  const [autoScale, setAutoScale] = useState(true);
  const [autoDateRange, setAutoDateRange] = useState(true);
  const [dataPatterns, setDataPatterns] = useState({});
  const [aiInsights, setAiInsights] = useState([]);
  const [animationEnabled, setAnimationEnabled] = useState(true);

  // New useful features
  const [showDataTable, setShowDataTable] = useState(false);
  const [exportFormat, setExportFormat] = useState('png');
  const [showOutliers, setShowOutliers] = useState(false);
  const [dataQuality, setDataQuality] = useState(null);
  const [correlationMatrix, setCorrelationMatrix] = useState(null);

  // Error handling and retry logic
  const handleError = useCallback((error, operation) => {
    console.error(`Error in ${operation}:`, error);
    setError({ message: error.message, operation });
    setLoading(false);
  }, []);

  const retryOperation = useCallback(async (operation, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setError(null);
        setRetryCount(attempt);
        await operation();
        setRetryCount(0);
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          handleError(error, 'retry operation');
          return;
        }
        // Exponential backoff: wait 1s, 2s, 4s between retries
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
  }, [handleError]);

  // AI-powered data analysis
  const analyzeDataPatterns = useCallback((data, columns) => {
    const patterns = detectDataPatterns(data, columns);
    setDataPatterns(patterns);

    // Generate AI insights
    const insights = [];
    Object.entries(patterns).forEach(([col, pattern]) => {
      if (pattern.trend === 'increasing') {
        insights.push(`📈 ${col} shows an increasing trend`);
      } else if (pattern.trend === 'decreasing') {
        insights.push(`📉 ${col} shows a decreasing trend`);
      }

      if (pattern.volatility === 'high') {
        insights.push(`⚡ ${col} has high volatility - consider smoothing`);
      }

      if (pattern.seasonality) {
        insights.push(`🔄 ${col} shows seasonal pattern (period: ${pattern.seasonality})`);
      }

      if (pattern.outliers.length > 0) {
        insights.push(`🎯 ${col} has ${pattern.outliers.length} outliers detected`);
      }
    });

    setAiInsights(insights);
  }, []);

  // Detect timestamp format and convert appropriately
  const convertTimestamp = useCallback((timestamp) => {
    if (!timestamp) return new Date();

    // First try to parse as a date string (like "2024-01-01")
    if (typeof timestamp === 'string') {
      const dateFromString = new Date(timestamp);
      if (!isNaN(dateFromString.getTime())) {
        return dateFromString;
      }
    }

    const num = parseFloat(timestamp);
    if (isNaN(num)) {
      // If it's not a number, try parsing as string again
      const dateFromString = new Date(timestamp);
      return !isNaN(dateFromString.getTime()) ? dateFromString : new Date();
    }

    // Handle numeric timestamps
    if (num < 1000000000) { // Less than year 2001 in Unix timestamp
      // This might be GPS time (seconds since GPS epoch: Jan 6, 1980)
      const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime();
      return new Date(gpsEpoch + num * 1000);
    } else if (num < 10000000000) { // Unix timestamp in seconds
      return new Date(num * 1000);
    } else { // Unix timestamp in milliseconds
      return new Date(num);
    }
  }, []);

  // Auto-scale date range
  const applyAutoDateRange = useCallback(() => {
    if (!autoDateRange || !data.length) return;

    const optimalRange = calculateOptimalDateRange(data, selectedX, convertTimestamp);

    if (optimalRange.start && optimalRange.end) {
      setStartDate(optimalRange.start);
      setEndDate(optimalRange.end);
    }
  }, [autoDateRange, data, selectedX, convertTimestamp]);

  // File upload with retry logic and AI analysis
  const handleFileUpload = useCallback((file) => {
    const uploadOperation = () => {
      return new Promise((resolve, reject) => {
        setLoading(true);
        setError(null);

        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            try {
              if (results.errors.length > 0) {
                throw new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
              }

              if (!results.data || results.data.length === 0) {
                throw new Error('No data found in the uploaded file');
              }

              const columns = Object.keys(results.data[0]);
              const numericColumns = columns.filter(col =>
                results.data.some(row => !isNaN(parseFloat(row[col])) && isFinite(row[col]))
              );

              if (numericColumns.length === 0) {
                throw new Error('No numeric columns found in the data');
              }

              setData(results.data);
              setDataColumns(columns);
              setPointOptions(columns);
              setFileName(file.name);

              // Save data to localStorage for quick access later
              try {
                localStorage.setItem(`asb-viewer-file-${file.name}`, JSON.stringify({
                  data: results.data,
                  columns: columns,
                  timestamp: Date.now()
                }));
              } catch (err) {
                console.warn("Could not save file data to localStorage:", err);
              }

              // Add to recent files
              const fileInfo = {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                timestamp: Date.now()
              };

              const updatedRecentFiles = [
                fileInfo,
                ...recentFiles.filter(f => f.name !== file.name)
              ].slice(0, 5); // Keep only last 5 files

              setRecentFiles(updatedRecentFiles);
              localStorage.setItem('asb-viewer-recent-files', JSON.stringify(updatedRecentFiles));

              // AI analysis
              analyzeDataPatterns(results.data, numericColumns);

              setLoading(false);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => {
            reject(new Error(`Failed to parse CSV: ${error.message}`));
          }
        });
      });
    };

    retryOperation(uploadOperation);
  }, [retryOperation, analyzeDataPatterns]);

  // Auto-apply date range when data or settings change
  useEffect(() => {
    if (data.length > 0 && autoDateRange) {
      const optimalRange = calculateOptimalDateRange(data, selectedX, convertTimestamp);
      if (optimalRange.start && optimalRange.end) {
        setStartDate(optimalRange.start);
        setEndDate(optimalRange.end);
      }
    }
  }, [data, selectedX, autoDateRange, convertTimestamp]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.type === 'text/csv' || file.name.endsWith('.csv'));

    if (csvFile) {
      handleFileUpload(csvFile);
    } else {
      setError({ message: 'Please upload a CSV file', operation: 'file upload' });
    }
  }, [handleFileUpload]);

  // File input handler
  const handleFileInputChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Filter data based on date range
  const filteredData = useMemo(() => {
    if (!data.length || (!startDate && !endDate)) return data;

    return data.filter(row => {
      const timestamp = row[selectedX];
      const date = convertTimestamp(timestamp);

      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;

      return true;
    });
  }, [data, startDate, endDate, selectedX, convertTimestamp]);

  // Prepare chart data with smoothing - Group by PointName or similar identifier
  const chartData = useMemo(() => {
    if (!filteredData.length) return [];

    // Handle Dual Axis Chart Type
    if (chartType === CHART_TYPES.DUAL_AXIS) {
      console.log('Dual axis mode activated!', selectedY, selectedY2);

      // Check if we have a grouping column for dual axis too
      const groupingColumn = dataColumns.find(col =>
        col.toLowerCase().includes('point') ||
        col.toLowerCase().includes('name') ||
        col.toLowerCase().includes('id') ||
        col.toLowerCase().includes('station')
      );

      if (groupingColumn && filteredData.some(row => row[groupingColumn])) {
        // Group data by the grouping column for dual axis
        const groupedData = {};
        filteredData.forEach(row => {
          const groupKey = row[groupingColumn];
          if (!groupedData[groupKey]) {
            groupedData[groupKey] = [];
          }
          groupedData[groupKey].push(row);
        });

        const traces = [];
        let colorIndex = 0;

        // Create dual axis traces for each group
        Object.entries(groupedData).forEach(([groupName, groupRows]) => {
          const xValues = groupRows.map(row => convertTimestamp(row[selectedX]));
          const y1Values = groupRows.map(row => parseFloat(row[selectedY])).filter(val => !isNaN(val));
          const y2Values = groupRows.map(row => parseFloat(row[selectedY2])).filter(val => !isNaN(val));

          if (xValues.length > 0 && y1Values.length > 0) {
            // Apply relative to zero if enabled
            let finalY1Values = [...y1Values];
            let finalY2Values = [...y2Values];

            if (relativeToZero) {
              if (finalY1Values.length > 0) {
                const firstValue1 = Number(finalY1Values[0]);
                if (!isNaN(firstValue1)) {
                  finalY1Values = finalY1Values.map(val => {
                    const num = Number(val);
                    return isNaN(num) ? 0 : num - firstValue1;
                  });
                }
              }

              if (finalY2Values.length > 0) {
                const firstValue2 = Number(finalY2Values[0]);
                if (!isNaN(firstValue2)) {
                  finalY2Values = finalY2Values.map(val => {
                    const num = Number(val);
                    return isNaN(num) ? 0 : num - firstValue2;
                  });
                }
              }
            }

            // Y1 axis trace
            traces.push({
              x: xValues,
              y: finalY1Values,
              type: 'scatter',
              mode: 'lines+markers',
              name: `${groupName} - ${selectedY}`,
              line: { color: COLOR_PALETTE[colorIndex % COLOR_PALETTE.length] },
              marker: { color: COLOR_PALETTE[colorIndex % COLOR_PALETTE.length] },
              yaxis: 'y'
            });

            // Y2 axis trace - FIXED: Always create Y2 trace for dual axis
            traces.push({
              x: xValues,
              y: finalY2Values.length > 0 ? finalY2Values : y2Values,
              type: 'scatter',
              mode: 'lines+markers',
              name: `${groupName} - ${selectedY2}`,
              line: {
                color: '#038357', // Use theme color for Y2 axis
                dash: 'dash' // Dashed line to differentiate Y2 axis
              },
              marker: {
                color: '#038357',
                symbol: 'square' // Different marker for Y2 axis
              },
              yaxis: 'y2'
            });

            colorIndex++;
          }
        });

        return traces;
      } else {
        // Single trace dual axis (no grouping)
        const xValues = filteredData.map(row => convertTimestamp(row[selectedX]));
        const y1Values = filteredData.map(row => parseFloat(row[selectedY])).filter(val => !isNaN(val));
        const y2Values = filteredData.map(row => parseFloat(row[selectedY2])).filter(val => !isNaN(val));

        // Apply relative to zero if enabled
        let finalY1Values = relativeToZero ? makeRelativeToZero([...y1Values]) : [...y1Values];
        let finalY2Values = relativeToZero ? makeRelativeToZero([...y2Values]) : [...y2Values];

        return [
          {
            x: xValues,
            y: finalY1Values,
            type: 'scatter',
            mode: 'lines+markers',
            name: selectedY,
            line: { color: COLOR_PALETTE[0] },
            marker: { color: COLOR_PALETTE[0] },
            yaxis: 'y'
          },
          {
            x: xValues,
            y: finalY2Values,
            type: 'scatter',
            mode: 'lines+markers',
            name: selectedY2,
            line: { color: COLOR_PALETTE[1], dash: 'dash' },
            marker: { color: COLOR_PALETTE[1], symbol: 'square' },
            yaxis: 'y2'
          }
        ];
      }
    }

    // Check if we have a grouping column (PointName, ID, etc.)
    const groupingColumn = dataColumns.find(col =>
      col.toLowerCase().includes('point') ||
      col.toLowerCase().includes('name') ||
      col.toLowerCase().includes('id') ||
      col.toLowerCase().includes('station')
    );

    if (groupingColumn && filteredData.some(row => row[groupingColumn])) {
      // Group data by the grouping column
      const groupedData = {};
      filteredData.forEach(row => {
        const groupKey = row[groupingColumn];
        if (!groupedData[groupKey]) {
          groupedData[groupKey] = [];
        }
        groupedData[groupKey].push(row);
      });

      const traces = [];
      let colorIndex = 0;

      // Create a trace for each group
      Object.entries(groupedData).forEach(([groupName, groupRows]) => {
        const xValues = groupRows.map(row => convertTimestamp(row[selectedX]));
        const yValues = groupRows.map(row => parseFloat(row[selectedY])).filter(val => !isNaN(val));

        if (xValues.length > 0 && yValues.length > 0) {
          // Apply relative to zero if enabled - completely rewritten
          let finalYValues = [...yValues];

          // Force relative to zero to work correctly
          if (relativeToZero && finalYValues.length > 0) {
            // Find first valid number
            let firstValue = null;
            for (let i = 0; i < finalYValues.length; i++) {
              const num = Number(finalYValues[i]);
              if (!isNaN(num)) {
                firstValue = num;
                break;
              }
            }

            // Apply offset to all values
            if (firstValue !== null) {
              finalYValues = finalYValues.map(val => {
                const num = Number(val);
                return isNaN(num) ? 0 : num - firstValue;
              });

              // Debug log to verify
              console.log(`Group ${groupName}: Original first value: ${yValues[0]}, Adjusted: ${finalYValues[0]}`);
            }
          }

          const baseTrace = {
            x: xValues,
            y: finalYValues,
            type: chartType === CHART_TYPES.LINE ? 'scatter' : chartType,
            mode: chartType === CHART_TYPES.LINE ? 'lines+markers' : 'markers',
            name: `${groupName} - ${selectedY}`,
            line: { color: COLOR_PALETTE[colorIndex % COLOR_PALETTE.length] },
            marker: { color: COLOR_PALETTE[colorIndex % COLOR_PALETTE.length] }
          };

          traces.push(baseTrace);

          // Add smoothed line if enabled
          if (showSmooth && yValues.length > (smoothingType === 'count' ? smoothingWindow : 2)) {
            let smoothedY;

            if (smoothingType === 'time') {
              // Time-based smoothing
              const dataPoints = xValues.map((timestamp, idx) => ({
                timestamp: timestamp,
                value: finalYValues[idx]
              }));
              smoothedY = timeBasedMovingAverage(dataPoints, smoothingHours);
            } else {
              // Point count smoothing
              smoothedY = movingAverage(finalYValues, smoothingWindow);
            }

            traces.push({
              x: xValues,
              y: smoothedY,
              type: 'scatter',
              mode: 'lines',
              name: `${groupName} - ${selectedY} (Smoothed)`,
              line: {
                color: COLOR_PALETTE[colorIndex % COLOR_PALETTE.length],
                width: 3,
                dash: 'dash'
              },
              opacity: 0.7
            });
          }

          colorIndex++;
        }
      });

      return traces;
    } else {
      // Fallback to single trace if no grouping column found
      const xValues = filteredData.map(row => convertTimestamp(row[selectedX]));
      const yValues = filteredData.map(row => parseFloat(row[selectedY])).filter(val => !isNaN(val));

      // Apply relative to zero if enabled - completely rewritten
      let finalYValues = [...yValues];
      if (relativeToZero && finalYValues.length > 0) {
        // Find first valid number
        let firstValue = null;
        for (let i = 0; i < finalYValues.length; i++) {
          const num = Number(finalYValues[i]);
          if (!isNaN(num)) {
            firstValue = num;
            break;
          }
        }

        // Apply offset to all values
        if (firstValue !== null) {
          finalYValues = finalYValues.map(val => {
            const num = Number(val);
            return isNaN(num) ? 0 : num - firstValue;
          });

          // Force update to ensure it works
          console.log("Single trace relative to zero applied:", firstValue);
        }
      }

      const baseTrace = {
        x: xValues,
        y: finalYValues,
        type: chartType === CHART_TYPES.LINE ? 'scatter' : chartType,
        mode: chartType === CHART_TYPES.LINE ? 'lines+markers' : 'markers',
        name: selectedY,
        line: { color: COLOR_PALETTE[0] },
        marker: { color: COLOR_PALETTE[0] }
      };

      const traces = [baseTrace];

      // Add smoothed line if enabled
      if (showSmooth && yValues.length > smoothingWindow) {
        const smoothedY = movingAverage(yValues, smoothingWindow);
        traces.push({
          x: xValues,
          y: smoothedY,
          type: 'scatter',
          mode: 'lines',
          name: `${selectedY} (Smoothed)`,
          line: { color: COLOR_PALETTE[1], width: 3 },
          opacity: 0.8
        });
      }

      return traces;
    }
  }, [filteredData, selectedX, selectedY, selectedY2, chartType, showSmooth, smoothingWindow, convertTimestamp, dataColumns, relativeToZero, smoothingType, smoothingHours]);

  // Calculate statistics for current data
  const currentStats = useMemo(() => {
    if (!filteredData.length || !selectedY) return null;

    const values = filteredData
      .map(row => parseFloat(row[selectedY]))
      .filter(val => !isNaN(val));

    return calculateStatistics(values);
  }, [filteredData, selectedY]);

  // Error boundary component
  const ErrorDisplay = ({ error, onRetry, onDismiss }) => (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="text-red-600 mr-3">⚠️</div>
          <div>
            <h3 className="text-red-800 font-medium">Error in {error.operation}</h3>
            <p className="text-red-600 text-sm mt-1">{error.message}</p>
            {retryCount > 0 && (
              <p className="text-red-500 text-xs mt-1">Retry attempt: {retryCount}/3</p>
            )}
          </div>
        </div>
        <div className="flex space-x-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              disabled={loading}
            >
              {loading ? 'Retrying...' : 'Retry'}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'} transition-all duration-500`}>
      <div className="flex h-screen">
        {/* Clean Sidebar */}
        <div className={`${sidebarOpen ? 'w-80' : 'w-16'} transition-all duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col shadow-lg`}>
          {/* Header */}
          <div className="p-6 border-b border-slate-700/30">
            <div className="flex items-center justify-between">
              <div className={`${sidebarOpen ? 'block' : 'hidden'} transition-all duration-300`}>
                <h1 className={`font-bold text-xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  ASB Data Viewer
                </h1>
                <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Analytics Platform
                </p>
              </div>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`p-3 rounded-xl ${darkMode ? 'hover:bg-slate-800/80 text-slate-300 hover:text-white' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'} transition-all duration-300 hover:scale-110 hover:shadow-lg`}
              >
                {sidebarOpen ? '←' : '→'}
              </button>
            </div>
          </div>

          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* File Upload Section */}
              <div className={`${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'} p-4 rounded-lg border ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                <h3 className={`font-medium text-base mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  📁 Data Upload
                </h3>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : `${darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'}`
                    }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileInputChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer block">
                    <div className="text-sm mb-1">📊</div>
                    <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                      {fileName ? (
                        <span className="text-emerald-500 font-semibold">✓ {fileName}</span>
                      ) : (
                        <>
                          <span className="block mb-1">Drop CSV file here</span>
                          <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>or click to browse</span>
                        </>
                      )}
                    </p>
                  </label>
                </div>
              </div>

              {/* Recent Files */}
              {recentFiles.length > 0 && (
                <div className={`${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'} p-4 rounded-lg border ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                  <h3 className={`font-semibold text-lg mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    🕒 Recent Files
                  </h3>
                  <div className="space-y-3">
                    {recentFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${darkMode
                          ? 'bg-slate-800/50 border-slate-600 hover:bg-slate-700/50'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        onClick={() => {
                          // Try to load from localStorage if available
                          try {
                            const savedData = localStorage.getItem(`asb-viewer-file-${file.name}`);
                            if (savedData) {
                              const parsedData = JSON.parse(savedData);
                              setData(parsedData.data);
                              setDataColumns(parsedData.columns);
                              setPointOptions(parsedData.columns);
                              setFileName(file.name);

                              // AI analysis
                              const numericColumns = parsedData.columns.filter(col =>
                                parsedData.data.some(row => !isNaN(parseFloat(row[col])) && isFinite(row[col]))
                              );
                              analyzeDataPatterns(parsedData.data, numericColumns);
                              return;
                            }
                          } catch (err) {
                            console.error("Error loading cached file:", err);
                          }

                          // Fallback to file selection if cache not available
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.csv';
                          input.onchange = (e) => {
                            const selectedFile = e.target.files?.[0];
                            if (selectedFile) {
                              handleFileUpload(selectedFile);
                            }
                          };
                          input.click();
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(file.timestamp).toLocaleDateString()} • {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <div className="ml-2 text-gray-400">
                            📄
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setRecentFiles([]);
                        localStorage.removeItem('asb-viewer-recent-files');
                      }}
                      className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                      Clear Recent Files
                    </button>
                  </div>
                </div>
              )}

              {/* Column Selection */}
              {dataColumns.length > 0 && (
                <div className={`${darkMode ? 'bg-gradient-to-br from-slate-800/50 to-slate-700/30' : 'bg-gradient-to-br from-gray-50 to-white'} backdrop-blur-sm p-6 rounded-2xl border ${darkMode ? 'border-slate-700/50' : 'border-gray-200/50'} shadow-lg`}>
                  <h3 className={`font-semibold text-lg mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    📊 Column Selection
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-indigo-200">X-Axis (Time)</label>
                      <select
                        value={selectedX}
                        onChange={(e) => setSelectedX(e.target.value)}
                        className={`w-full p-2 border rounded-lg ${darkMode ? 'bg-gray-700/80 border-gray-600 text-white' : 'bg-white/90 border-gray-300'} focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200`}
                      >
                        {dataColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-indigo-200">Y-Axis (Value)</label>
                      <select
                        value={selectedY}
                        onChange={(e) => setSelectedY(e.target.value)}
                        className={`w-full p-2 border rounded-lg ${darkMode ? 'bg-gray-700/80 border-gray-600 text-white' : 'bg-white/90 border-gray-300'} focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200`}
                      >
                        {dataColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>

                    {/* Second Y-Axis for Dual Axis */}
                    {chartType === CHART_TYPES.DUAL_AXIS && (
                      <div>
                        <label className="block text-sm font-medium mb-1 text-purple-200">Y2-Axis (Second Value)</label>
                        <select
                          value={selectedY2}
                          onChange={(e) => setSelectedY2(e.target.value)}
                          className={`w-full p-2 border rounded-lg ${darkMode ? 'bg-gray-700/80 border-gray-600 text-white' : 'bg-white/90 border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200`}
                        >
                          {dataColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chart Settings */}
              {data.length > 0 && (
                <div className={`${darkMode ? 'bg-gradient-to-br from-slate-800/50 to-slate-700/30' : 'bg-gradient-to-br from-gray-50 to-white'} backdrop-blur-sm p-6 rounded-2xl border ${darkMode ? 'border-slate-700/50' : 'border-gray-200/50'} shadow-lg`}>
                  <h3 className={`font-medium text-base mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    ⚙️ Chart Settings
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Chart Type</label>
                      <select
                        value={chartType}
                        onChange={(e) => setChartType(e.target.value)}
                        className={`w-full p-3 border rounded-xl ${darkMode ? 'bg-slate-800/80 border-slate-600 text-white' : 'bg-white/90 border-gray-300'} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-300 hover:shadow-md`}
                      >
                        <option value={CHART_TYPES.LINE}>📈 Line Chart</option>
                        <option value={CHART_TYPES.SCATTER}>🔵 Scatter Plot</option>
                        <option value={CHART_TYPES.BAR}>📊 Bar Chart</option>
                        <option value={CHART_TYPES.HISTOGRAM}>📋 Histogram</option>
                        <option value={CHART_TYPES.DUAL_AXIS}>⚖️ Dual Axis</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <label htmlFor="show-smooth" className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Show Smoothing</label>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          id="show-smooth"
                          checked={showSmooth}
                          onChange={(e) => setShowSmooth(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>

                    {showSmooth && (
                      <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                          <label className="block text-sm font-medium mb-2">Smoothing Type</label>
                          <div className="flex space-x-4">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name="smoothingType"
                                value="count"
                                checked={smoothingType === 'count'}
                                onChange={(e) => setSmoothingType(e.target.value)}
                                className="mr-2"
                              />
                              <span className="text-sm">Point Count</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name="smoothingType"
                                value="time"
                                checked={smoothingType === 'time'}
                                onChange={(e) => setSmoothingType(e.target.value)}
                                className="mr-2"
                              />
                              <span className="text-sm">Time Based</span>
                            </label>
                          </div>
                        </div>

                        {smoothingType === 'count' ? (
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Points: {smoothingWindow}
                            </label>
                            <input
                              type="range"
                              min="3"
                              max="20"
                              value={smoothingWindow}
                              onChange={(e) => setSmoothingWindow(parseInt(e.target.value))}
                              className="w-full accent-blue-500"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Hours: {smoothingHours}
                            </label>
                            <input
                              type="range"
                              min="1"
                              max="168"
                              value={smoothingHours}
                              onChange={(e) => setSmoothingHours(parseInt(e.target.value))}
                              className="w-full accent-blue-500"
                            />
                            <div className="text-xs text-gray-500 mt-1">
                              {smoothingHours < 24 ? `${smoothingHours}h` : `${Math.round(smoothingHours / 24)}d`}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="relative-zero"
                        checked={relativeToZero}
                        onChange={(e) => setRelativeToZero(e.target.checked)}
                        className="rounded accent-blue-500"
                      />
                      <label htmlFor="relative-zero" className="text-sm">Start from Zero (Relative)</label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="show-grid"
                        checked={showGrid}
                        onChange={(e) => setShowGrid(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="show-grid" className="text-sm">Show Grid</label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="show-legend"
                        checked={showLegend}
                        onChange={(e) => setShowLegend(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="show-legend" className="text-sm">Show Legend</label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="animation"
                        checked={animationEnabled}
                        onChange={(e) => setAnimationEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="animation" className="text-sm">Enable Animations</label>
                    </div>
                  </div>
                </div>
              )}

              {/* Date Range Filter */}
              {data.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Date Range Filter</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="auto-date-range"
                        checked={autoDateRange}
                        onChange={(e) => setAutoDateRange(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="auto-date-range" className="text-sm">Auto Date Range</label>
                    </div>

                    {!autoDateRange && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">Start Date</label>
                          <DatePicker
                            selected={startDate}
                            onChange={setStartDate}
                            showTimeSelect
                            dateFormat="yyyy-MM-dd HH:mm"
                            className={`w-full p-2 border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            placeholderText="Select start date"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">End Date</label>
                          <DatePicker
                            selected={endDate}
                            onChange={setEndDate}
                            showTimeSelect
                            dateFormat="yyyy-MM-dd HH:mm"
                            className={`w-full p-2 border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                            placeholderText="Select end date"
                          />
                        </div>
                      </>
                    )}

                    <button
                      onClick={() => {
                        setStartDate(null);
                        setEndDate(null);
                      }}
                      className="w-full px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                    >
                      Clear Date Filter
                    </button>
                  </div>
                </div>
              )}

              {/* Auto-Scale Settings */}
              {data.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Auto-Scale Settings</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="auto-scale"
                        checked={autoScale}
                        onChange={(e) => setAutoScale(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="auto-scale" className="text-sm">Auto Scale Y-Axis</label>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Insights */}
              {aiInsights.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">AI Insights</h3>
                  <div className="space-y-2">
                    {aiInsights.map((insight, idx) => (
                      <div key={idx} className="text-sm p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                        {insight}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Statistics */}
              {showStatistics && currentStats && (
                <div>
                  <h3 className="font-medium mb-3">Statistics</h3>
                  <div className="space-y-2 text-sm">
                    <div>Count: {currentStats.count}</div>
                    <div>Mean: {currentStats.mean}</div>
                    <div>Std Dev: {currentStats.stdDev}</div>
                    <div>Min: {currentStats.min}</div>
                    <div>Max: {currentStats.max}</div>
                    <div>Median: {currentStats.median}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* About Section */}
          {sidebarOpen && (
            <div className={`mt-auto p-6 border-t ${darkMode ? 'border-slate-700/50' : 'border-gray-200/50'}`}>
              <div className={`${darkMode ? 'bg-gradient-to-br from-slate-800/50 to-slate-700/30' : 'bg-gradient-to-br from-gray-50 to-white'} backdrop-blur-sm p-4 rounded-xl border ${darkMode ? 'border-slate-700/50' : 'border-gray-200/50'} shadow-lg`}>
                <h3 className={`font-semibold text-base mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  ℹ️ About
                </h3>
                <div className={`text-sm space-y-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                  <p className="font-medium">ASB Data Viewer</p>
                  <p>Advanced analytics platform for CSV data visualization and analysis.</p>
                  <div className="pt-2 border-t border-slate-600/30">
                    <p className="text-xs">
                      <span className="font-medium">Developer:</span><br />
                      Ahmet Selim Boyalı
                    </p>
                    <p className="text-xs mt-1 opacity-75">
                      © 2024 - Data Analytics Solution
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className={`p-4 border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors duration-200 text-lg"
                  title="Toggle Dark Mode"
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>
                <button
                  onClick={() => setShowStatistics(!showStatistics)}
                  className="px-4 py-2 bg-gradient-to-r from-[#038357] to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 text-sm font-medium shadow-sm"
                >
                  {showStatistics ? 'Hide Stats' : 'Show Stats'}
                </button>

                <button
                  onClick={() => setShowDataTable(!showDataTable)}
                  className="px-4 py-2 bg-gradient-to-r from-[#038357] to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 text-sm font-medium shadow-sm"
                >
                  {showDataTable ? 'Hide Table' : 'Show Table'}
                </button>

                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.download = `chart-${Date.now()}.png`;
                    link.href = document.querySelector('.js-plotly-plot .plotly .svg-container .main-svg').toDataURL();
                    link.click();
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-[#038357] to-teal-700 text-white rounded-lg hover:from-teal-700 hover:to-teal-800 transition-all duration-200 text-sm font-medium shadow-sm"
                >
                  📤 Export
                </button>
              </div>

              {loading && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm">Loading...</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4">
              <ErrorDisplay
                error={error}
                onRetry={() => {
                  if (error.operation === 'file upload' && fileName) {
                    // Retry file upload logic would go here
                    setError(null);
                  }
                }}
                onDismiss={() => setError(null)}
              />
            </div>
          )}

          {/* Chart Area */}
          <div className="flex-1 p-4">
            {data.length > 0 ? (
              <div className="h-full">
                <Plot
                  data={chartData}
                  layout={{
                    title: {
                      text: chartType === CHART_TYPES.DUAL_AXIS ? `${selectedY} & ${selectedY2} vs ${selectedX}` : `${selectedY} vs ${selectedX}`,
                      font: {
                        size: 18,
                        color: darkMode ? '#ffffff' : '#000000'
                      }
                    },
                    xaxis: {
                      title: selectedX,
                      showgrid: showGrid,
                      type: 'date',
                      gridcolor: darkMode ? '#374151' : '#e5e7eb'
                    },
                    yaxis: {
                      title: selectedY,
                      showgrid: showGrid,
                      side: 'left',
                      gridcolor: darkMode ? '#374151' : '#e5e7eb'
                    },
                    ...(chartType === CHART_TYPES.DUAL_AXIS && {
                      yaxis2: {
                        title: selectedY2,
                        showgrid: false,
                        overlaying: 'y',
                        side: 'right',
                        gridcolor: darkMode ? '#374151' : '#e5e7eb',
                        titlefont: { color: '#038357', size: 14 },
                        tickfont: { color: '#038357', size: 12 },
                        zeroline: false,
                        showline: true,
                        linecolor: '#038357',
                        linewidth: 2
                      }
                    }),
                    showlegend: showLegend,
                    paper_bgcolor: darkMode ? '#1f2937' : '#ffffff',
                    plot_bgcolor: darkMode ? '#374151' : '#ffffff',
                    font: { color: darkMode ? '#ffffff' : '#000000' },
                    transition: {
                      duration: animationEnabled ? 500 : 0,
                      easing: 'cubic-in-out'
                    },
                    margin: { t: 60, r: 80, b: 60, l: 60 }
                  }}
                  style={{ width: '100%', height: '100%' }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    modeBarButtonsToRemove: ['pan2d', 'lasso2d']
                  }}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg mb-2">📈</div>
                  <h2 className="text-xl font-medium mb-2">No Data Loaded</h2>
                  <p className="text-gray-500">Upload a CSV file to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}