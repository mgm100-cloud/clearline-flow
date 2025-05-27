import React, { useState, useEffect } from 'react';
import { Plus, Database, Users, TrendingUp, BarChart3, LogOut, Search, ChevronUp, ChevronDown } from 'lucide-react';

const ClearlineFlow = () => {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(''); // 'readwrite' or 'readonly'
  const [activeTab, setActiveTab] = useState('input');

  // Data state
  const [tickers, setTickers] = useState([]);
  const [analysts] = useState(['LT', 'GA', 'DP', 'MS', 'DO']);
  const [selectedAnalyst, setSelectedAnalyst] = useState('LT');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // Earnings tracking state
  const [earningsData, setEarningsData] = useState([]);
  const [selectedCYQ, setSelectedCYQ] = useState('2024Q4');
  const [selectedEarningsAnalyst, setSelectedEarningsAnalyst] = useState('');

  // Mock login
  const handleLogin = (role) => {
    setIsAuthenticated(true);
    setUserRole(role);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole('');
    setActiveTab('input');
  };

  // Mock data fetching functions (replace with real API calls)
  const fetchStockData = async (ticker) => {
    // Mock API response
    return {
      name: `${ticker} Company Ltd`,
      price: Math.round((Math.random() * 200 + 50) * 100) / 100,
      adv3Month: Math.round(Math.random() * 10000000),
      marketCap: Math.round(Math.random() * 50000000000)
    };
  };

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  // Add new ticker
  const addTicker = async (tickerData) => {
    // Capitalize the ticker and format price targets
    const capitalizedTickerData = {
      ...tickerData,
      ticker: tickerData.ticker.toUpperCase(),
      ptBear: formatPriceTarget(tickerData.ptBear),
      ptBase: formatPriceTarget(tickerData.ptBase),
      ptBull: formatPriceTarget(tickerData.ptBull)
    };
    
    const stockData = await fetchStockData(capitalizedTickerData.ticker);
    const newTicker = {
      ...capitalizedTickerData,
      id: Date.now(),
      dateIn: new Date().toLocaleDateString('en-US', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit' 
      }),
      pokeDate: new Date().toLocaleDateString('en-US', { 
        year: '2-digit', 
        month: '2-digit', 
        day: '2-digit' 
      }),
      name: stockData.name,
      inputPrice: stockData.price,
      currentPrice: stockData.price,
      marketCap: stockData.marketCap,
      adv3Month: stockData.adv3Month
    };
    setTickers(prev => [...prev, newTicker]);
  };

  // Update ticker
  const updateTicker = (id, updates) => {
    // Format price targets in updates if they exist
    const formattedUpdates = {
      ...updates,
      ...(updates.ptBear !== undefined && { ptBear: formatPriceTarget(updates.ptBear) }),
      ...(updates.ptBase !== undefined && { ptBase: formatPriceTarget(updates.ptBase) }),
      ...(updates.ptBull !== undefined && { ptBull: formatPriceTarget(updates.ptBull) })
    };

    setTickers(prev => prev.map(ticker => 
      ticker.id === id 
        ? { 
            ...ticker, 
            ...formattedUpdates, 
            pokeDate: new Date().toLocaleDateString('en-US', { 
              year: '2-digit', 
              month: '2-digit', 
              day: '2-digit' 
            })
          }
        : ticker
    ));
  };

  // Earnings tracking functions
  const updateEarningsData = (ticker, cyq, updates) => {
    setEarningsData(prev => {
      const existingIndex = prev.findIndex(item => item.ticker === ticker && item.cyq === cyq);
      if (existingIndex >= 0) {
        const newData = [...prev];
        newData[existingIndex] = { ...newData[existingIndex], ...updates };
        return newData;
      } else {
        return [...prev, { ticker, cyq, ...updates }];
      }
    });
  };

  const getEarningsData = (ticker, cyq) => {
    return earningsData.find(item => item.ticker === ticker && item.cyq === cyq) || {};
  };

  // Sort function
  const sortData = (data, field) => {
    if (!field) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Clearline Flow</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {userRole === 'readwrite' ? 'Read/Write Access' : 'Read Only'}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {userRole === 'readwrite' && (
              <button
                onClick={() => setActiveTab('input')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'input'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Plus className="inline h-4 w-4 mr-1" />
                Input Page
              </button>
            )}
            <button
              onClick={() => setActiveTab('database')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'database'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Database className="inline h-4 w-4 mr-1" />
              Idea Database
            </button>
            <button
              onClick={() => setActiveTab('database-detailed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'database-detailed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Database className="inline h-4 w-4 mr-1" />
              Idea Database Detailed
            </button>
            <button
              onClick={() => setActiveTab('pm-detail')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pm-detail'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="inline h-4 w-4 mr-1" />
              PM Detail
            </button>
            <button
              onClick={() => setActiveTab('analyst-detail')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analyst-detail'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="inline h-4 w-4 mr-1" />
              Analyst Detail
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'team'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <TrendingUp className="inline h-4 w-4 mr-1" />
              Team Output
            </button>
            <button
              onClick={() => setActiveTab('earnings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'earnings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="inline h-4 w-4 mr-1" />
              Earnings Tracking
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {activeTab === 'input' && userRole === 'readwrite' && (
          <InputPage onAddTicker={addTicker} analysts={analysts} />
        )}
        {activeTab === 'database' && (
          <DatabasePage 
            tickers={sortData(tickers, sortField)} 
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
            onUpdate={userRole === 'readwrite' ? updateTicker : null}
            analysts={analysts}
          />
        )}
        {activeTab === 'database-detailed' && (
          <DatabaseDetailedPage 
            tickers={sortData(tickers, sortField)} 
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
            onUpdate={userRole === 'readwrite' ? updateTicker : null}
            analysts={analysts}
          />
        )}
        {activeTab === 'pm-detail' && (
          <PMDetailPage tickers={tickers} />
        )}
        {activeTab === 'analyst-detail' && (
          <AnalystDetailPage 
            tickers={tickers} 
            analysts={analysts}
            selectedAnalyst={selectedAnalyst}
            onSelectAnalyst={setSelectedAnalyst}
          />
        )}
        {activeTab === 'team' && (
          <TeamOutputPage tickers={tickers} analysts={analysts} />
        )}
        {activeTab === 'earnings' && (
          <EarningsTrackingPage 
            tickers={tickers}
            selectedCYQ={selectedCYQ}
            onSelectCYQ={setSelectedCYQ}
            selectedEarningsAnalyst={selectedEarningsAnalyst}
            onSelectEarningsAnalyst={setSelectedEarningsAnalyst}
            earningsData={earningsData}
            onUpdateEarnings={updateEarningsData}
            getEarningsData={getEarningsData}
            analysts={analysts}
          />
        )}
      </main>
    </div>
  );
};

// Login Screen Component
const LoginScreen = ({ onLogin }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <TrendingUp className="h-12 w-12 text-blue-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Clearline Flow
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Hedge Fund Workflow Management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-4">
            <button
              onClick={() => onLogin('readwrite')}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Login with Read/Write Access
            </button>
            <button
              onClick={() => onLogin('readonly')}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Login with Read Only Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Input Page Component
const InputPage = ({ onAddTicker, analysts }) => {
  const [formData, setFormData] = useState({
    ticker: '',
    lsPosition: 'Long',
    thesis: '',
    priority: 'A',
    status: 'New',
    analyst: '',
    source: '',
    ptBear: '',
    ptBase: '',
    ptBull: '',
    catalystDate: '',
    valueOrGrowth: '',
    // Boolean fields
    maTargetBuyer: false,
    maTargetValuation: false,
    maTargetSeller: false,
    bigMoveRevert: false,
    activist: false,
    activistPotential: false,
    insiderTradeSignal: false,
    newMgmt: false,
    spin: false,
    bigAcq: false,
    fraudRisk: false,
    regulatoryRisk: false,
    cyclical: false,
    nonCyclical: false,
    highBeta: false,
    momo: false,
    selfHelp: false,
    rateExposure: false,
    strongDollar: false,
    extremeValuation: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('=== FORM SUBMISSION START ===');
    console.log('Current form data:', formData);
    console.log('Ticker:', formData.ticker);
    console.log('Thesis:', formData.thesis);
    
    if (!formData.ticker || !formData.thesis) {
      console.log('Missing required fields!');
      setSubmitMessage('Please fill in both Ticker and Thesis fields');
      return;
    }

    console.log('Required fields present, proceeding...');
    setIsSubmitting(true);
    setSubmitMessage('Adding investment idea...');
    
    try {
      console.log('Calling onAddTicker...');
      await onAddTicker(formData);
      console.log('onAddTicker completed successfully');
      
      setSubmitMessage('Investment idea added successfully!');
      
      // Reset form
      const resetData = {
        ticker: '',
        lsPosition: 'Long',
        thesis: '',
        priority: 'A',
        status: 'New',
        analyst: '',
        source: '',
        ptBear: '',
        ptBase: '',
        ptBull: '',
        catalystDate: '',
        valueOrGrowth: '',
        maTargetBuyer: false,
        maTargetValuation: false,
        maTargetSeller: false,
        bigMoveRevert: false,
        activist: false,
        activistPotential: false,
        insiderTradeSignal: false,
        newMgmt: false,
        spin: false,
        bigAcq: false,
        fraudRisk: false,
        regulatoryRisk: false,
        cyclical: false,
        nonCyclical: false,
        highBeta: false,
        momo: false,
        selfHelp: false,
        rateExposure: false,
        strongDollar: false,
        extremeValuation: false
      };
      
      console.log('Resetting form...');
      setFormData(resetData);
      
      setTimeout(() => {
        setSubmitMessage('');
      }, 3000);
      
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setSubmitMessage('Error adding investment idea: ' + error.message);
    } finally {
      console.log('Setting isSubmitting to false');
      setIsSubmitting(false);
      console.log('=== FORM SUBMISSION END ===');
    }
  };

  const handleChange = (field, value) => {
    // Format price targets on change
    if (field === 'ptBear' || field === 'ptBase' || field === 'ptBull') {
      setFormData(prev => ({
        ...prev,
        [field]: value // Store raw value during input
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handlePriceTargetBlur = (field, value) => {
    // Format price targets when user leaves the field
    const formatted = formatPriceTarget(value);
    setFormData(prev => ({
      ...prev,
      [field]: formatted
    }));
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Add New Investment Idea
        </h3>
        
        <div className="space-y-6">
          {/* Required Fields */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Ticker *
              </label>
              <input
                type="text"
                required
                value={formData.ticker}
                onChange={(e) => handleChange('ticker', e.target.value)}
                placeholder="e.g., RL US"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                L/S *
              </label>
              <select
                value={formData.lsPosition}
                onChange={(e) => handleChange('lsPosition', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="Long">Long</option>
                <option value="Short">Short</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Thesis *
            </label>
            <textarea
              required
              rows={3}
              value={formData.thesis}
              onChange={(e) => handleChange('thesis', e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="F">F</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="New">New</option>
                <option value="Portfolio">Portfolio</option>
                <option value="Current">Current</option>
                <option value="On-Deck">On-Deck</option>
                <option value="Old">Old</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Analyst
              </label>
              <select
                value={formData.analyst}
                onChange={(e) => handleChange('analyst', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select Analyst</option>
                {analysts.map(analyst => (
                  <option key={analyst} value={analyst}>{analyst}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price Targets */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PT Bear
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.ptBear}
                onChange={(e) => handleChange('ptBear', e.target.value)}
                onBlur={(e) => handlePriceTargetBlur('ptBear', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PT Base
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.ptBase}
                onChange={(e) => handleChange('ptBase', e.target.value)}
                onBlur={(e) => handlePriceTargetBlur('ptBase', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                PT Bull
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.ptBull}
                onChange={(e) => handleChange('ptBull', e.target.value)}
                onBlur={(e) => handlePriceTargetBlur('ptBull', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          {submitMessage && (
            <div className={`p-3 rounded-md ${
              submitMessage.includes('successfully') 
                ? 'bg-green-100 text-green-700' 
                : submitMessage.includes('Error')
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {submitMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={(e) => {
                console.log('Button clicked!');
                console.log('Form data:', formData);
                handleSubmit(e);
              }}
              className={`ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                isSubmitting 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {isSubmitting ? 'Adding...' : 'Add Investment Idea'}
            </button>
          </div>

          {/* Additional Optional Fields Section */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <div className="mb-4">
              <h4 className="text-md font-medium text-gray-900 mb-2">Additional Fields</h4>
              <p className="text-sm text-gray-600">These fields provide additional detail and analysis for the investment idea.</p>
            </div>

            {/* Source and Catalyst Date */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Source
                </label>
                <input
                  type="text"
                  value={formData.source}
                  onChange={(e) => handleChange('source', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Catalyst Date
                </label>
                <input
                  type="date"
                  value={formData.catalystDate}
                  onChange={(e) => handleChange('catalystDate', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>

            {/* Value or Growth */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">
                Value or Growth
              </label>
              <select
                value={formData.valueOrGrowth}
                onChange={(e) => handleChange('valueOrGrowth', e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">Select...</option>
                <option value="Value">Value</option>
                <option value="Growth">Growth</option>
              </select>
            </div>

            {/* Boolean Investment Characteristics */}
            <div className="mb-6">
              <h5 className="text-sm font-medium text-gray-700 mb-3">Investment Characteristics</h5>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { key: 'maTargetBuyer', label: 'M&A Target - Buyer' },
                  { key: 'maTargetValuation', label: 'M&A Target - Valuation' },
                  { key: 'maTargetSeller', label: 'M&A Target - Seller' },
                  { key: 'bigMoveRevert', label: 'Big Move Revert' },
                  { key: 'activist', label: 'Activist' },
                  { key: 'activistPotential', label: 'Activist Potential' },
                  { key: 'insiderTradeSignal', label: 'Insider Trade Signal' },
                  { key: 'newMgmt', label: 'New Management' },
                  { key: 'spin', label: 'Spin' },
                  { key: 'bigAcq', label: 'Big Acquisition' },
                  { key: 'fraudRisk', label: 'Fraud Risk' },
                  { key: 'regulatoryRisk', label: 'Regulatory Risk' },
                  { key: 'cyclical', label: 'Cyclical' },
                  { key: 'nonCyclical', label: 'Non-Cyclical' },
                  { key: 'highBeta', label: 'High Beta' },
                  { key: 'momo', label: 'Momentum' },
                  { key: 'selfHelp', label: 'Self-Help' },
                  { key: 'rateExposure', label: 'Rate Exposure' },
                  { key: 'strongDollar', label: 'Strong Dollar' },
                  { key: 'extremeValuation', label: 'Extreme Valuation' }
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData[key]}
                      onChange={(e) => handleChange(key, e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm text-gray-700">{label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Database Page Component
const DatabasePage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts }) => {
  const SortableHeader = ({ field, children }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Investment Idea Database ({tickers.length} ideas)
        </h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader field="ticker">Ticker</SortableHeader>
                <SortableHeader field="name">Name</SortableHeader>
                <SortableHeader field="dateIn">Date In</SortableHeader>
                <SortableHeader field="lsPosition">L/S</SortableHeader>
                <SortableHeader field="priority">Priority</SortableHeader>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="analyst">Analyst</SortableHeader>
                <SortableHeader field="currentPrice">Current Price</SortableHeader>
                {onUpdate && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickers.map((ticker) => (
                <TickerRow 
                  key={ticker.id} 
                  ticker={ticker} 
                  onUpdate={onUpdate}
                  analysts={analysts}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {tickers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No investment ideas added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Ticker Row Component for inline editing
const TickerRow = ({ ticker, onUpdate, analysts }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(ticker);

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  const handleSave = () => {
    onUpdate(ticker.id, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(ticker);
    setIsEditing(false);
  };

  const pnl = ticker.currentPrice && ticker.inputPrice 
    ? ((ticker.currentPrice - ticker.inputPrice) / ticker.inputPrice * 100).toFixed(2)
    : 0;

  if (isEditing && onUpdate) {
    return (
      <tr className="bg-blue-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {ticker.ticker}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.name}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.dateIn}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.lsPosition}
            onChange={(e) => setEditData({...editData, lsPosition: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.priority}
            onChange={(e) => setEditData({...editData, priority: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="F">F</option>
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.status}
            onChange={(e) => setEditData({...editData, status: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="New">New</option>
            <option value="Portfolio">Portfolio</option>
            <option value="Current">Current</option>
            <option value="On-Deck">On-Deck</option>
            <option value="Old">Old</option>
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <select
            value={editData.analyst}
            onChange={(e) => setEditData({...editData, analyst: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">Select...</option>
            {analysts.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
          </select>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
          ${ticker.currentPrice}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-xs"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-red-600 hover:text-red-900 text-xs"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {ticker.ticker}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.dateIn}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.lsPosition === 'Long' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {ticker.lsPosition}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.priority}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.status === 'Current' ? 'bg-green-100 text-green-800' :
          ticker.status === 'Portfolio' ? 'bg-blue-100 text-blue-800' :
          ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
          ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.analyst || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        ${ticker.currentPrice}
        <div className={`text-xs ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {pnl >= 0 ? '+' : ''}{pnl}%
        </div>
      </td>
      {onUpdate && (
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 hover:text-blue-900 text-xs"
          >
            Edit
          </button>
        </td>
      )}
    </tr>
  );
};

// Database Detailed Page Component - Shows all fields
const DatabaseDetailedPage = ({ tickers, onSort, sortField, sortDirection, onUpdate, analysts }) => {
  const SortableHeader = ({ field, children }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  const formatBoolean = (value) => value ? '✓' : '';
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return dateString;
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Investment Idea Database - Detailed View ({tickers.length} ideas)
        </h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Basic Info */}
                <SortableHeader field="ticker">Ticker</SortableHeader>
                <SortableHeader field="name">Name</SortableHeader>
                <SortableHeader field="dateIn">Date In</SortableHeader>
                <SortableHeader field="pokeDate">Poke Date</SortableHeader>
                <SortableHeader field="lsPosition">L/S</SortableHeader>
                <SortableHeader field="priority">Priority</SortableHeader>
                <SortableHeader field="status">Status</SortableHeader>
                <SortableHeader field="analyst">Analyst</SortableHeader>
                <SortableHeader field="source">Source</SortableHeader>
                
                {/* Financial Data */}
                <SortableHeader field="inputPrice">Input Price</SortableHeader>
                <SortableHeader field="currentPrice">Current Price</SortableHeader>
                <SortableHeader field="marketCap">Market Cap</SortableHeader>
                <SortableHeader field="adv3Month">ADV 3M</SortableHeader>
                
                {/* Price Targets */}
                <SortableHeader field="ptBear">PT Bear</SortableHeader>
                <SortableHeader field="ptBase">PT Base</SortableHeader>
                <SortableHeader field="ptBull">PT Bull</SortableHeader>
                
                {/* Additional Info */}
                <SortableHeader field="catalystDate">Catalyst Date</SortableHeader>
                <SortableHeader field="valueOrGrowth">Value/Growth</SortableHeader>
                
                {/* M&A Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Buyer</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Val</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">M&A Target Seller</th>
                
                {/* Other Investment Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Big Move Revert</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activist</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activist Potential</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insider Trade</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Mgmt</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spin</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Big Acq</th>
                
                {/* Risk Factors */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fraud Risk</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regulatory Risk</th>
                
                {/* Market Characteristics */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Non-Cyclical</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">High Beta</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Momentum</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Self Help</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate Exposure</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strong Dollar</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Extreme Val</th>
                
                {/* Thesis */}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thesis</th>
                
                {onUpdate && <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickers.map((ticker) => (
                <DetailedTickerRow 
                  key={ticker.id} 
                  ticker={ticker} 
                  onUpdate={onUpdate}
                  analysts={analysts}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {tickers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No investment ideas added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Detailed Ticker Row Component for inline editing in detailed view
const DetailedTickerRow = ({ ticker, onUpdate, analysts }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(ticker);

  // Helper function to format price targets to 2 decimal places
  const formatPriceTarget = (value) => {
    if (!value || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  const handleSave = () => {
    onUpdate(ticker.id, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(ticker);
    setIsEditing(false);
  };

  const formatBoolean = (value) => value ? '✓' : '';
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return dateString;
  };

  const pnl = ticker.currentPrice && ticker.inputPrice 
    ? ((ticker.currentPrice - ticker.inputPrice) / ticker.inputPrice * 100).toFixed(2)
    : 0;

  if (isEditing && onUpdate) {
    return (
      <tr className="bg-blue-50">
        {/* Basic Info - mostly non-editable */}
        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {ticker.ticker}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 max-w-32 truncate">
          {ticker.name}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDate(ticker.dateIn)}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatDate(ticker.pokeDate)}
        </td>
        
        {/* Editable Fields */}
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.lsPosition}
            onChange={(e) => setEditData({...editData, lsPosition: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          >
            <option value="Long">Long</option>
            <option value="Short">Short</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.priority}
            onChange={(e) => setEditData({...editData, priority: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-12"
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="F">F</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.status}
            onChange={(e) => setEditData({...editData, status: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          >
            <option value="New">New</option>
            <option value="Portfolio">Portfolio</option>
            <option value="Current">Current</option>
            <option value="On-Deck">On-Deck</option>
            <option value="Old">Old</option>
          </select>
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.analyst}
            onChange={(e) => setEditData({...editData, analyst: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          >
            <option value="">-</option>
            {analysts.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
          </select>
        </td>
        
        {/* Source */}
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="text"
            value={editData.source || ''}
            onChange={(e) => setEditData({...editData, source: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-20"
          />
        </td>
        
        {/* Financial Data - mostly read-only */}
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
          ${ticker.inputPrice || '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
          ${ticker.currentPrice || '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.marketCap ? `${(ticker.marketCap / 1000000).toFixed(0)}M` : '-'}
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.adv3Month ? `${(ticker.adv3Month / 1000000).toFixed(1)}M` : '-'}
        </td>
        
        {/* Price Targets - Editable */}
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBear || ''}
            onChange={(e) => setEditData({...editData, ptBear: e.target.value})}
            onBlur={(e) => setEditData({...editData, ptBear: formatPriceTarget(e.target.value)})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBase || ''}
            onChange={(e) => setEditData({...editData, ptBase: e.target.value})}
            onBlur={(e) => setEditData({...editData, ptBase: formatPriceTarget(e.target.value)})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="number"
            step="0.01"
            value={editData.ptBull || ''}
            onChange={(e) => setEditData({...editData, ptBull: e.target.value})}
            onBlur={(e) => setEditData({...editData, ptBull: formatPriceTarget(e.target.value)})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          />
        </td>
        
        {/* Catalyst Date */}
        <td className="px-3 py-4 whitespace-nowrap">
          <input
            type="date"
            value={editData.catalystDate || ''}
            onChange={(e) => setEditData({...editData, catalystDate: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-24"
          />
        </td>
        
        {/* Value or Growth */}
        <td className="px-3 py-4 whitespace-nowrap">
          <select
            value={editData.valueOrGrowth || ''}
            onChange={(e) => setEditData({...editData, valueOrGrowth: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-16"
          >
            <option value="">-</option>
            <option value="Value">Value</option>
            <option value="Growth">Growth</option>
          </select>
        </td>
        
        {/* Boolean Fields - Checkboxes */}
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetBuyer || false}
            onChange={(e) => setEditData({...editData, maTargetBuyer: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetValuation || false}
            onChange={(e) => setEditData({...editData, maTargetValuation: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.maTargetSeller || false}
            onChange={(e) => setEditData({...editData, maTargetSeller: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.bigMoveRevert || false}
            onChange={(e) => setEditData({...editData, bigMoveRevert: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.activist || false}
            onChange={(e) => setEditData({...editData, activist: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.activistPotential || false}
            onChange={(e) => setEditData({...editData, activistPotential: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.insiderTradeSignal || false}
            onChange={(e) => setEditData({...editData, insiderTradeSignal: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.newMgmt || false}
            onChange={(e) => setEditData({...editData, newMgmt: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.spin || false}
            onChange={(e) => setEditData({...editData, spin: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.bigAcq || false}
            onChange={(e) => setEditData({...editData, bigAcq: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.fraudRisk || false}
            onChange={(e) => setEditData({...editData, fraudRisk: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.regulatoryRisk || false}
            onChange={(e) => setEditData({...editData, regulatoryRisk: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.cyclical || false}
            onChange={(e) => setEditData({...editData, cyclical: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.nonCyclical || false}
            onChange={(e) => setEditData({...editData, nonCyclical: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.highBeta || false}
            onChange={(e) => setEditData({...editData, highBeta: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.momo || false}
            onChange={(e) => setEditData({...editData, momo: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.selfHelp || false}
            onChange={(e) => setEditData({...editData, selfHelp: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.rateExposure || false}
            onChange={(e) => setEditData({...editData, rateExposure: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.strongDollar || false}
            onChange={(e) => setEditData({...editData, strongDollar: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        <td className="px-3 py-4 whitespace-nowrap text-center">
          <input
            type="checkbox"
            checked={editData.extremeValuation || false}
            onChange={(e) => setEditData({...editData, extremeValuation: e.target.checked})}
            className="h-3 w-3"
          />
        </td>
        
        {/* Thesis - Editable */}
        <td className="px-3 py-4">
          <textarea
            value={editData.thesis || ''}
            onChange={(e) => setEditData({...editData, thesis: e.target.value})}
            className="text-xs border border-gray-300 rounded px-1 py-1 w-48 h-16 resize-none"
            rows={3}
          />
        </td>
        
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-xs font-medium"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-red-600 hover:text-red-900 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
      {/* Basic Info */}
      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {ticker.ticker}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 max-w-32 truncate">
        {ticker.name}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(ticker.dateIn)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(ticker.pokeDate)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.lsPosition === 'Long' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {ticker.lsPosition}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.priority}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          ticker.status === 'Current' ? 'bg-green-100 text-green-800' :
          ticker.status === 'Portfolio' ? 'bg-blue-100 text-blue-800' :
          ticker.status === 'On-Deck' ? 'bg-yellow-100 text-yellow-800' :
          ticker.status === 'New' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {ticker.status}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        {ticker.analyst || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.source || '-'}
      </td>
      
      {/* Financial Data */}
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        ${ticker.inputPrice || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
        ${ticker.currentPrice || '-'}
        {ticker.currentPrice && ticker.inputPrice && (
          <div className={`text-xs ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {pnl >= 0 ? '+' : ''}{pnl}%
          </div>
        )}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.marketCap ? `${(ticker.marketCap / 1000000).toFixed(0)}M` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.adv3Month ? `${(ticker.adv3Month / 1000000).toFixed(1)}M` : '-'}
      </td>
      
      {/* Price Targets */}
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.ptBear ? `${parseFloat(ticker.ptBear).toFixed(2)}` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.ptBase ? `${parseFloat(ticker.ptBase).toFixed(2)}` : '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.ptBull ? `${parseFloat(ticker.ptBull).toFixed(2)}` : '-'}
      </td>
      
      {/* Additional Info */}
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.catalystDate || '-'}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.valueOrGrowth || '-'}
      </td>
      
      {/* Boolean Fields */}
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.maTargetBuyer)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.maTargetValuation)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.maTargetSeller)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.bigMoveRevert)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.activist)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.activistPotential)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.insiderTradeSignal)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.newMgmt)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.spin)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.bigAcq)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.fraudRisk)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.regulatoryRisk)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.cyclical)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.nonCyclical)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.highBeta)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.momo)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.selfHelp)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.rateExposure)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.strongDollar)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
        {formatBoolean(ticker.extremeValuation)}
      </td>
      
      {/* Thesis */}
      <td className="px-3 py-4 text-sm text-gray-500 max-w-64">
        <div className="truncate" title={ticker.thesis}>
          {ticker.thesis}
        </div>
      </td>
      
      {onUpdate && (
        <td className="px-3 py-4 whitespace-nowrap text-sm">
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 hover:text-blue-900 text-xs"
          >
            Edit
          </button>
        </td>
      )}
    </tr>
  );
};

// PM Detail Page Component
const PMDetailPage = ({ tickers }) => {
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  
  const statusOrder = ['Current', 'On-Deck', 'Portfolio', 'New', 'Old'];
  
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortData = (data, field) => {
    if (!field) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      // Handle numeric fields
      if (field === 'currentPrice' || field === 'ptBear' || field === 'ptBase' || field === 'ptBull') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  const SortableHeader = ({ field, children }) => (
    <th 
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </th>
  );

  const calculatePercentChange = (priceTarget, currentPrice) => {
    if (!priceTarget || !currentPrice || currentPrice === 0) return '';
    const change = (parseFloat(priceTarget) / parseFloat(currentPrice) - 1) * 100;
    return `${change >= 0 ? '+' : ''}${Math.round(change)}%`;
  };

  const getPercentChangeValue = (priceTarget, currentPrice) => {
    if (!priceTarget || !currentPrice || currentPrice === 0) return 0;
    return (parseFloat(priceTarget) / parseFloat(currentPrice) - 1) * 100;
  };

  const shouldHighlightRow = (ticker) => {
    const bearPercent = getPercentChangeValue(ticker.ptBear, ticker.currentPrice);
    const basePercent = getPercentChangeValue(ticker.ptBase, ticker.currentPrice);
    
    const shouldHighlight = bearPercent > -15 && basePercent > 50;
    
    // More visible debug - this should definitely show
    if (shouldHighlight) {
      console.log(`🟢 HIGHLIGHTING: ${ticker.ticker} - Bear: ${bearPercent.toFixed(1)}% (>${-15}), Base: ${basePercent.toFixed(1)}% (>50)`);
    } else {
      console.log(`⚪ Not highlighting: ${ticker.ticker} - Bear: ${bearPercent.toFixed(1)}%, Base: ${basePercent.toFixed(1)}%`);
    }
    
    return shouldHighlight;
  };

  const groupedTickers = statusOrder.reduce((acc, status) => {
    const statusTickers = tickers.filter(ticker => ticker.status === status);
    if (statusTickers.length > 0) {
      acc[status] = sortData(statusTickers, sortField);
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h3 className="text-lg leading-6 font-medium text-gray-900">
        PM Detail Output
      </h3>
      
      {statusOrder.map(status => {
        const statusTickers = groupedTickers[status];
        if (!statusTickers || statusTickers.length === 0) return null;
        
        return (
          <div key={status} className="bg-white shadow rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200">
              <h4 className="text-md font-medium text-gray-900">
                {status} ({statusTickers.length})
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableHeader field="ticker">Ticker</SortableHeader>
                    <SortableHeader field="lsPosition">L/S</SortableHeader>
                    <SortableHeader field="currentPrice">Current Price</SortableHeader>
                    <SortableHeader field="priority">Priority</SortableHeader>
                    <SortableHeader field="analyst">Analyst</SortableHeader>
                    <SortableHeader field="ptBear">PT Bear</SortableHeader>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bear %</th>
                    <SortableHeader field="ptBase">PT Base</SortableHeader>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base %</th>
                    <SortableHeader field="ptBull">PT Bull</SortableHeader>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bull %</th>
                    <SortableHeader field="thesis">Thesis</SortableHeader>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {statusTickers.map((ticker) => (
                    <tr key={ticker.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {ticker.ticker}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          ticker.lsPosition === 'Long' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {ticker.lsPosition}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${ticker.currentPrice}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
                          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
                          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ticker.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {ticker.analyst || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {ticker.ptBear ? `${ticker.ptBear}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`${
                          calculatePercentChange(ticker.ptBear, ticker.currentPrice).startsWith('+') 
                            ? 'text-green-600' 
                            : calculatePercentChange(ticker.ptBear, ticker.currentPrice).startsWith('-')
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {calculatePercentChange(ticker.ptBear, ticker.currentPrice) || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {ticker.ptBase ? `${ticker.ptBase}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`${
                          calculatePercentChange(ticker.ptBase, ticker.currentPrice).startsWith('+') 
                            ? 'text-green-600' 
                            : calculatePercentChange(ticker.ptBase, ticker.currentPrice).startsWith('-')
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {calculatePercentChange(ticker.ptBase, ticker.currentPrice) || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {ticker.ptBull ? `${ticker.ptBull}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`${
                          calculatePercentChange(ticker.ptBull, ticker.currentPrice).startsWith('+') 
                            ? 'text-green-600' 
                            : calculatePercentChange(ticker.ptBull, ticker.currentPrice).startsWith('-')
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {calculatePercentChange(ticker.ptBull, ticker.currentPrice) || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="max-w-xs truncate">
                          {ticker.thesis}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Analyst Detail Page Component
const AnalystDetailPage = ({ tickers, analysts, selectedAnalyst, onSelectAnalyst }) => {
  const statusOrder = ['Current', 'On-Deck', 'Portfolio', 'New', 'Old'];
  
  const analystTickers = tickers.filter(ticker => ticker.analyst === selectedAnalyst);
  const groupedTickers = statusOrder.reduce((acc, status) => {
    acc[status] = analystTickers.filter(ticker => ticker.status === status);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Analyst Detail Output
        </h3>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Select Analyst:</label>
          <select
            value={selectedAnalyst}
            onChange={(e) => onSelectAnalyst(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            {analysts.map(analyst => (
              <option key={analyst} value={analyst}>{analyst}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="bg-gray-100 px-4 py-2 rounded">
        <p className="text-sm text-gray-600">
          Showing {analystTickers.length} ideas for analyst {selectedAnalyst}
        </p>
      </div>
      
      {statusOrder.map(status => {
        const statusTickers = groupedTickers[status];
        if (statusTickers.length === 0) return null;
        
        return (
          <div key={status} className="bg-white shadow rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200">
              <h4 className="text-md font-medium text-gray-900">
                {status} ({statusTickers.length})
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-24 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                    <th className="w-48 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="w-20 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">L/S</th>
                    <th className="w-20 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="w-28 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thesis</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {statusTickers.map((ticker) => (
                    <tr key={ticker.id}>
                      <td className="w-24 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {ticker.ticker}
                      </td>
                      <td className="w-48 px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {ticker.name}
                      </td>
                      <td className="w-20 px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          ticker.lsPosition === 'Long' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {ticker.lsPosition}
                        </span>
                      </td>
                      <td className="w-20 px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          ticker.priority === 'A' ? 'bg-red-100 text-red-800' :
                          ticker.priority === 'B' ? 'bg-yellow-100 text-yellow-800' :
                          ticker.priority === 'C' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ticker.priority}
                        </span>
                      </td>
                      <td className="w-28 px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${ticker.currentPrice ? parseFloat(ticker.currentPrice).toFixed(2) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="max-w-xs truncate">
                          {ticker.thesis}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      
      {analystTickers.length === 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-center text-gray-500">No ideas assigned to analyst {selectedAnalyst}</p>
        </div>
      )}
    </div>
  );
};

// Team Output Page Component
const TeamOutputPage = ({ tickers, analysts }) => {
  const getTickersForCell = (analyst, status, lsPosition) => {
    return tickers.filter(ticker => 
      ticker.analyst === analyst && 
      ticker.status === status && 
      ticker.lsPosition === lsPosition
    );
  };

  const getUnassignedTickersForCell = (status, lsPosition) => {
    return tickers.filter(ticker => 
      (!ticker.analyst || ticker.analyst === '') && 
      ticker.status === status && 
      ticker.lsPosition === lsPosition &&
      ['Current', 'On-Deck', 'Portfolio'].includes(ticker.status)
    );
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Team Output Matrix
        </h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Analyst
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current-Long
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current-Short
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  OnDeck-Long
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  OnDeck-Short
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Portfolio-Long
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Portfolio-Short
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analysts.map((analyst) => (
                <tr key={analyst}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {analyst}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="space-y-1">
                      {getTickersForCell(analyst, 'Current', 'Long').map(ticker => (
                        <div key={ticker.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          {ticker.ticker}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="space-y-1">
                      {getTickersForCell(analyst, 'Current', 'Short').map(ticker => (
                        <div key={ticker.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          {ticker.ticker}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="space-y-1">
                      {getTickersForCell(analyst, 'On-Deck', 'Long').map(ticker => (
                        <div key={ticker.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          {ticker.ticker}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="space-y-1">
                      {getTickersForCell(analyst, 'On-Deck', 'Short').map(ticker => (
                        <div key={ticker.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          {ticker.ticker}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="space-y-1">
                      {getTickersForCell(analyst, 'Portfolio', 'Long').map(ticker => (
                        <div key={ticker.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          {ticker.ticker}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="space-y-1">
                      {getTickersForCell(analyst, 'Portfolio', 'Short').map(ticker => (
                        <div key={ticker.id} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          {ticker.ticker}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              
              {/* To Assign Row */}
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  To Assign
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="space-y-1">
                    {getUnassignedTickersForCell('Current', 'Long').map(ticker => (
                      <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        {ticker.ticker}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="space-y-1">
                    {getUnassignedTickersForCell('Current', 'Short').map(ticker => (
                      <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        {ticker.ticker}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="space-y-1">
                    {getUnassignedTickersForCell('On-Deck', 'Long').map(ticker => (
                      <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        {ticker.ticker}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="space-y-1">
                    {getUnassignedTickersForCell('On-Deck', 'Short').map(ticker => (
                      <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        {ticker.ticker}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="space-y-1">
                    {getUnassignedTickersForCell('Portfolio', 'Long').map(ticker => (
                      <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        {ticker.ticker}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="space-y-1">
                    {getUnassignedTickersForCell('Portfolio', 'Short').map(ticker => (
                      <div key={ticker.id} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        {ticker.ticker}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Earnings Tracking Page Component
const EarningsTrackingPage = ({ tickers, selectedCYQ, onSelectCYQ, selectedEarningsAnalyst, onSelectEarningsAnalyst, earningsData, onUpdateEarnings, getEarningsData, analysts }) => {
  // Filter tickers to only show Portfolio status
  let portfolioTickers = tickers.filter(ticker => ticker.status === 'Portfolio');
  
  // Apply analyst filter if selected
  if (selectedEarningsAnalyst) {
    portfolioTickers = portfolioTickers.filter(ticker => ticker.analyst === selectedEarningsAnalyst);
  }
  
  // Generate CYQ options (current year and next year, all quarters)
  const currentYear = new Date().getFullYear();
  const cyqOptions = [];
  for (let year of [currentYear - 1, currentYear, currentYear + 1]) {
    for (let quarter of ['Q1', 'Q2', 'Q3', 'Q4']) {
      cyqOptions.push(`${year}${quarter}`);
    }
  }

  // Calculate days until earnings
  const calculateDaysUntilEarnings = (earningsDate) => {
    if (!earningsDate) return 999999; // Put items without dates at the bottom
    const today = new Date();
    const earnings = new Date(earningsDate);
    const diffTime = earnings - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Sort tickers by Days Until Earnings (smallest first)
  const sortedTickers = [...portfolioTickers].sort((a, b) => {
    const aEarningsData = getEarningsData(a.ticker, selectedCYQ);
    const bEarningsData = getEarningsData(b.ticker, selectedCYQ);
    const aDays = calculateDaysUntilEarnings(aEarningsData.earningsDate);
    const bDays = calculateDaysUntilEarnings(bEarningsData.earningsDate);
    return aDays - bDays;
  });

  // Format days for display
  const formatDaysUntilEarnings = (earningsDate) => {
    if (!earningsDate) return '-';
    const days = calculateDaysUntilEarnings(earningsDate);
    if (days === 999999) return '-';
    return days;
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Earnings Tracking ({sortedTickers.length} Portfolio tickers)
          </h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Analyst:</label>
              <select
                value={selectedEarningsAnalyst}
                onChange={(e) => onSelectEarningsAnalyst(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="">All Analysts</option>
                {analysts.map(analyst => (
                  <option key={analyst} value={analyst}>{analyst}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">CYQ:</label>
              <select
                value={selectedCYQ}
                onChange={(e) => onSelectCYQ(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                {cyqOptions.map(cyq => (
                  <option key={cyq} value={cyq}>{cyq}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analyst</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CYQ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Until Earnings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Earnings Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">QP Call Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preview Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Callback Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTickers.map((ticker) => (
                <EarningsTrackingRow 
                  key={`${ticker.ticker}-${selectedCYQ}`}
                  ticker={ticker}
                  cyq={selectedCYQ}
                  earningsData={getEarningsData(ticker.ticker, selectedCYQ)}
                  onUpdateEarnings={onUpdateEarnings}
                  formatDaysUntilEarnings={formatDaysUntilEarnings}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {sortedTickers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {selectedEarningsAnalyst 
                ? `No Portfolio tickers found for analyst ${selectedEarningsAnalyst}.`
                : 'No Portfolio tickers found.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Earnings Tracking Row Component
const EarningsTrackingRow = ({ ticker, cyq, earningsData, onUpdateEarnings, formatDaysUntilEarnings }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    earningsDate: earningsData.earningsDate || '',
    qpCallDate: earningsData.qpCallDate || '',
    previewDate: earningsData.previewDate || '',
    callbackDate: earningsData.callbackDate || ''
  });

  const handleSave = () => {
    onUpdateEarnings(ticker.ticker, cyq, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      earningsDate: earningsData.earningsDate || '',
      qpCallDate: earningsData.qpCallDate || '',
      previewDate: earningsData.previewDate || '',
      callbackDate: earningsData.callbackDate || ''
    });
    setIsEditing(false);
  };

  const daysUntilEarnings = formatDaysUntilEarnings(earningsData.earningsDate);

  if (isEditing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {ticker.ticker}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {ticker.analyst || '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {cyq}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {daysUntilEarnings}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="date"
            value={editData.earningsDate}
            onChange={(e) => setEditData({...editData, earningsDate: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="date"
            value={editData.qpCallDate}
            onChange={(e) => setEditData({...editData, qpCallDate: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="date"
            value={editData.previewDate}
            onChange={(e) => setEditData({...editData, previewDate: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="date"
            value={editData.callbackDate}
            onChange={(e) => setEditData({...editData, callbackDate: e.target.value})}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          />
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-xs"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-red-600 hover:text-red-900 text-xs"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50" onDoubleClick={() => setIsEditing(true)}>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {ticker.ticker}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {ticker.analyst || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {cyq}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className={`${
          daysUntilEarnings !== '-' && daysUntilEarnings <= 7 ? 'text-red-600 font-medium' :
          daysUntilEarnings !== '-' && daysUntilEarnings <= 30 ? 'text-yellow-600 font-medium' :
          'text-gray-900'
        }`}>
          {daysUntilEarnings}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {earningsData.earningsDate || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {earningsData.qpCallDate || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {earningsData.previewDate || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {earningsData.callbackDate || '-'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <button
          onClick={() => setIsEditing(true)}
          className="text-blue-600 hover:text-blue-900 text-xs"
        >
          Edit
        </button>
      </td>
    </tr>
  );
};

export default ClearlineFlow;