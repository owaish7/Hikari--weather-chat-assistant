"use client"

// Conversational We      content: '👋 Hello! I\\'m your weather-based lifestyle assistant. I can help you with recommendations based on current weather conditions in both English and Japanese. What would you like to know?\\n\\nこんにちは！私は天気に基づいたライフスタイルアシスタントです。英語と日本語の両方で、現在の天気に基づいたおすすめをお手伝いできます。何について知りたいですか？',ther Chatbot
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { fetchWeather, fetchGeminiResponse } from '@/lib/api';
import { WeatherData } from '@/lib/constants';
import { useVoiceInput } from '@/hooks/useVoiceInput';

// Message Interface
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  weatherData?: WeatherData;
  sources?: { uri: string; title: string }[];
}




const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const linkify = (s: string): string =>
  s.replace(/\b(https?:\/\/[^\s<]+)\b/gi, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);

const applyInlineEmphasis = (s: string): string => {
 
  const keywords = [
    'today', 'tonight', 'this morning', 'this afternoon', 'this evening',
    'rain', 'snow', 'thunderstorm', 'storm', 'clear', 'sunny', 'cloudy', 'overcast', 'drizzle', 'humid', 'dry', 'windy',
    'hot', 'very hot', 'warm', 'cool', 'cold', 'chilly',
    'uv index', 'air quality', 'visibility',
    'warning', 'alert', 'advisory'
  ];
  let out = s;
  // Temperatures like 23°C or 72°F
  out = out.replace(/(-?\d+(?:\.\d+)?)\s?°\s?[CF]/gi, '<strong>$&</strong>');
  
  out = out.replace(/(\b\d{1,3})%/g, '<strong>$1%</strong>');
  
  out = out.replace(/(\b\d+(?:\.\d+)?)\s?(?:m\/s|km\/?h|kph|mph)\b/gi, '<strong>$&</strong>');
 
  out = out.replace(/\b(\d{1,2})(?:[:.]\d{2})?\s?(?:am|pm)\b/gi, '<strong>$&</strong>');
  // Highlight gear/advice words
  const highlight = ['umbrella', 'raincoat', 'jacket', 'coat', 'sunscreen', 'water', 'mask', 'hydrated', 'layers'];
  highlight.forEach(w => {
    const re = new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, '<span class="hl">$&</span>');
  });
  // Bold keywords
  keywords.forEach(w => {
    const re = new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, '<strong>$&</strong>');
  });
  return out;
};

const formatAssistantHtml = (text: string): { __html: string } => {
  const lines = text.split(/\r?\n/);
  let html = '';
  let inList = false;
  const bulletRe = /^\s*[-•]\s+(.*)$/;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(bulletRe);
    if (bullet) {
      if (!inList) { html += '<ul class="assistant-list">'; inList = true; }
      const item = applyInlineEmphasis(linkify(escapeHtml(bullet[1])));
      html += `<li>${item}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim() === '') { html += '<br />'; }
      else {
        const content = applyInlineEmphasis(linkify(escapeHtml(line)));
        html += `<p>${content}</p>`;
      }
    }
  }
  if (inList) html += '</ul>';
  return { __html: html };
};

// Utility Icons
const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-2">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    <span className="ml-2 text-gray-600">Thinking...</span>
  </div>
);

const App: React.FC = () => {
  const [userInput, setUserInput] = useState<string>('');
  const [location, setLocation] = useState<string>('Tokyo');
  const [voiceLanguage, setVoiceLanguage] = useState<string>('ja-JP');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'system',
      content: '👋 こんにちは！私は天気に基づいたライフスタイルアシスタントです。現在の天気に基づいて、日本語と英語でおすすめをお手伝いできます。何について知りたいですか？\n\nHello! I\'m your weather-based lifestyle assistant. I can help you with recommendations based on current weather conditions in both Japanese and English. What would you like to know?',
      timestamp: new Date()
    }
  ]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState<boolean>(false);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  const [compactHeader, setCompactHeader] = useState<boolean>(false);
  const compactRef = useRef<boolean>(false);
  const tickingRef = useRef<boolean>(false);
  const lastToggleRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved ? saved === 'dark' : prefersDark;
      setDarkMode(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    } catch {}
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  }, []);

 
  const detectCity = useCallback((text: string) => {
      try {
        const lowerText = text.toLowerCase();
        
        // Common city names (Japanese and English) 
        const commonCities = [
          
          '東京', 'とうきょう', '大阪', 'おおさか', '京都', 'きょうと', '横浜', 'よこはま', '神戸', 'こうべ',
          '名古屋', 'なごや', '福岡', 'ふくおか', '札幌', 'さっぽろ', '仙台', 'せんだい', '広島', 'ひろしま',
          
          '東京都', '大阪市', '京都市', '横浜市', '神戸市', '名古屋市', '福岡市', '札幌市', '仙台市', '広島市',
          
          'tokyo', 'osaka', 'kyoto', 'yokohama', 'kobe', 'nagoya', 'fukuoka', 'sapporo', 'sendai', 'hiroshima',
          'new york', 'london', 'paris', 'berlin', 'sydney', 'melbourne', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
         
          'delhi', 'new delhi', 'mumbai', 'bombay', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'calcutta', 'pune', 'ahmedabad'
        ];
        
       
        const cityMap: { [key: string]: string } = {
          '東京': 'Tokyo', 'とうきょう': 'Tokyo', '東京都': 'Tokyo',
          '大阪': 'Osaka', 'おおさか': 'Osaka', '大阪市': 'Osaka',
          '京都': 'Kyoto', 'きょうと': 'Kyoto', '京都市': 'Kyoto',
          '横浜': 'Yokohama', 'よこはま': 'Yokohama', '横浜市': 'Yokohama',
          '神戸': 'Kobe', 'こうべ': 'Kobe', '神戸市': 'Kobe',
          '名古屋': 'Nagoya', 'なごや': 'Nagoya', '名古屋市': 'Nagoya',
          '福岡': 'Fukuoka', 'ふくおか': 'Fukuoka', '福岡市': 'Fukuoka',
          '札幌': 'Sapporo', 'さっぽろ': 'Sapporo', '札幌市': 'Sapporo',
          '仙台': 'Sendai', 'せんだい': 'Sendai', '仙台市': 'Sendai',
          '広島': 'Hiroshima', 'ひろしま': 'Hiroshima', '広島市': 'Hiroshima',
          
          'new delhi': 'Delhi', 'delhi': 'Delhi',
          'mumbai': 'Mumbai', 'bombay': 'Mumbai',
          'bengaluru': 'Bengaluru', 'bangalore': 'Bengaluru',
          'hyderabad': 'Hyderabad', 'chennai': 'Chennai',
          'kolkata': 'Kolkata', 'calcutta': 'Kolkata',
          'pune': 'Pune', 'ahmedabad': 'Ahmedabad'
        };
        
        
        for (const city of commonCities) {
          const cityLower = city.toLowerCase();
          const hasJapanese = /[ぁ-んァ-ヶ一-龯]/.test(cityLower);
          if (hasJapanese) {
           
            if (lowerText.includes(cityLower)) {
              return cityMap[city] || city;
            }
          } else {
            
            const wordBoundaryRegex = new RegExp(`\\b${cityLower.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (wordBoundaryRegex.test(lowerText)) {
              return cityMap[city] || city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
            }
          }
        }
        
       
  const locationPatterns = [
          // Japanese patterns (more specific)
          /([ぁ-んァ-ヶー一-龯]{2,})の天気/, // "[City]の天気" pattern
          /([ぁ-んァ-ヶー一-龯]{2,})市/, // "[City]市" pattern 
          /([ぁ-んァ-ヶー一-龯]{2,})県/, // "[Prefecture]県" pattern
          /([ぁ-んァ-ヶー一-龯]{2,})区/, // "[Ward]区" pattern
          // English patterns (more specific, avoid greedy matching)
          /weather\s+in\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?:\s|$)/i,
         
          /([a-zA-Z][a-zA-Z]+(?:\s+[a-zA-Z][a-zA-Z]+){0,2})\s+weather(?:\s|$)/i,
          /([a-zA-Z][a-zA-Z\s]{1,20}?)\s+temperature(?:\s|$)/i,
          /\bin\s+([a-zA-Z][a-zA-Z\s]{1,20}?)(?:\s+(?:today|now|currently|right now))?(?:\s|$)/i
        ];
        
        // Check patterns
        for (const pattern of locationPatterns) {
          const match = lowerText.match(pattern);
          if (match && match[1]) {
            const detectedCityRaw = match[1].trim();
           
            const jpBan = ['今日', '明日', '天気', '気温', '風', '湿度', '空気', '今', '現在', '明後日'];
            const isJapanese = /[ぁ-んァ-ヶ一-龯]/.test(detectedCityRaw);

            if (isJapanese) {
             
              const normalized = detectedCityRaw.replace(/[市県区]$/, '');
              if (jpBan.some(w => normalized.includes(w))) continue;
              if (cityMap[detectedCityRaw]) return cityMap[detectedCityRaw];
              if (cityMap[normalized]) return cityMap[normalized];
             
              continue;
            } else {
            
              const cleaned = detectedCityRaw.replace(/\s+/g, ' ').trim();
              const tokens = cleaned.split(/\s+/);
              const stop = new Set(['what', "what's", 'how', "how's", 'is', 'are', 'was', 'were', 'will', 'would', 'could', 'should', 'the', 'a', 'an', 'tell', 'can', 'please', 'show', 'give', 'me', 'about', 'today', 'now', 'currently']);
              const hasStop = tokens.some(t => stop.has(t));
            
              if (!hasStop && cleaned.length >= 2 && cleaned.length <= 30 && tokens.length <= 3) {
                return cleaned.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ');
              }
              
              if (/^the\s+hague$/i.test(cleaned)) {
                return 'The Hague';
              }
            }
          }
        }
        
        return null;
      } catch (error) {
        console.error('Error in location detection:', error);
        return null;
      }
    }, []);

  
  const handleTranscript = useCallback((transcript: string) => {
    try {
      
      const detectedLocation = detectCity(transcript);
      if (detectedLocation && detectedLocation !== location) {
        console.log(`Location detected and updated: ${location} -> ${detectedLocation}`);
        setLocation(detectedLocation);
      }
      
      setUserInput(transcript);
      setShouldAutoSubmit(true);
    } catch (error) {
      console.error('Error processing transcript:', error);
     
      setUserInput(transcript);
      setShouldAutoSubmit(true);
    }
  }, [location, detectCity]);

  const { isListening, voiceError, isSupported, startListening } = useVoiceInput(handleTranscript, voiceLanguage);

  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  

  //  "Scroll to latest" button 
  useEffect(() => {
    const ENTER_COMPACT_AT = 120; 
    const EXIT_COMPACT_AT = 48;   

    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        try {
          const doc = document.documentElement;
          const y = window.scrollY || doc.scrollTop || 0;
          const nearBottom = window.innerHeight + y >= (doc.scrollHeight - 120);
          setShowScrollButton(!nearBottom);

          // Hysteresis + debounce to avoid fluttering around the threshold
          let nextCompact = compactRef.current;
          if (!nextCompact && y > ENTER_COMPACT_AT) nextCompact = true;
          else if (nextCompact && y < EXIT_COMPACT_AT) nextCompact = false;

          if (nextCompact !== compactRef.current) {
            const now = Date.now();
            // small minimum interval between toggles
            if (now - lastToggleRef.current > 250) {
              lastToggleRef.current = now;
              compactRef.current = nextCompact;
              setCompactHeader(nextCompact);
            }
          }
        } finally {
          tickingRef.current = false;
        }
      });
    };

    
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  //Chat Message Submission 
  const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!userInput.trim()) {
      setError('Please enter a message.');
      return;
    }

    
    const typedDetectedCity = detectCity(userInput);
    if (typedDetectedCity && typedDetectedCity !== location) {
      setLocation(typedDetectedCity);
    }

   
  const cityForFetch = (typedDetectedCity || location || '').trim();
    
    const looksInvalidCity = /^(what|how)(\s+is|\s+are)?(\s+the)?$/i.test(cityForFetch) || cityForFetch.length < 2;
    if (!typedDetectedCity && looksInvalidCity) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 0.25).toString(),
        type: 'system',
        content: '📍 Please mention a city (e.g., "Weather in Delhi" or set it in the City field above).',
        timestamp: new Date()
      }]);
      setError('Please provide a city.');
      setLoading(false);
      return;
    }

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: userInput.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setLoading(true);

    try {
      // 1. Fetch Weather Data 
      let weather: WeatherData;
      try {
        weather = await fetchWeather(cityForFetch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        const is404 = msg.includes('404') && msg.toLowerCase().includes('city not found');
        if (is404 && typedDetectedCity && location && typedDetectedCity !== location) {
         
          weather = await fetchWeather(location);
         
          setMessages(prev => [...prev, {
            id: (Date.now() + 0.5).toString(),
            type: 'system',
            content: `⚠️ Could not find city "${typedDetectedCity}". Showing weather for ${location} instead.`,
            timestamp: new Date()
          }]);
        } else {
          throw err;
        }
      }

      // 2. Build conversation 
      const recentMessages = messages.slice(-5); // Last 5 messages for context
      const conversationContext = recentMessages
        .filter(msg => msg.type !== 'system')
        .map(msg => `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      // 3. Create query 
      const enhancedQuery = conversationContext 
        ? `Previous conversation:\n${conversationContext}\n\nCurrent question: ${userInput}`
        : userInput;

  // 4. Fetch Gemini Response
  const response = await fetchGeminiResponse(enhancedQuery, weather, voiceLanguage);

      // 5. Add assistant response 
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.text,
        timestamp: new Date(),
        weatherData: weather,
        sources: response.sources
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err: unknown) {
      console.error('Chat Error:', err);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        type: 'system',
        content: `❌ Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      if (err instanceof Error && err.message.includes('API key is not set')) {
        setError(err.message + ". Please ensure NEXT_PUBLIC_GEMINI_API_KEY is correctly set in your .env.local.");
      } else {
        setError(err instanceof Error ? err.message : 'An unknown error occurred during processing.');
      }
    } finally {
      setLoading(false);
    }
  }, [userInput, location, messages, voiceLanguage, detectCity]);

  
  useEffect(() => {
    if (shouldAutoSubmit) {
      setShouldAutoSubmit(false);
      if (userInput && !loading) {
        handleSendMessage();
      }
    }
  }, [shouldAutoSubmit, userInput, loading, handleSendMessage]);

 
  const getWeatherIcon = (condition: string) => {
    const conditionLower = condition.toLowerCase();
    if (conditionLower.includes('clear')) return '☀️';
    if (conditionLower.includes('cloud')) return '☁️';
    if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) return '🌧️';
    if (conditionLower.includes('thunder')) return '⛈️';
    if (conditionLower.includes('snow')) return '🌨️';
    return '🌀';
  };



  const clearChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        type: 'system',
        content: '👋 チャットをクリアしました！天気に基づいたおすすめについて、どのようにお手伝いできますか？\n\nChat cleared! How can I help you with weather-based recommendations?',
        timestamp: new Date()
      }
    ]);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Header */}
      <header className={`app-header sticky top-0 z-50 bg-white/90 dark:bg-[#0b1220]/80 backdrop-blur-md backdrop-saturate-150 border-b border-gray-200/70 dark:border-[#243044]/80 shadow-sm ${compactHeader ? 'p-2' : 'p-4'}`}>
  <div className={`${compactHeader ? 'max-w-2xl' : 'max-w-3xl'} mx-auto flex flex-row justify-between items-center ${compactHeader ? 'gap-2 flex-nowrap' : 'gap-3 flex-wrap'}`}>
          <div className="text-left">
            <h1 className={`${compactHeader ? 'text-xl' : 'text-2xl'} font-bold text-indigo-700 dark:text-indigo-300`}>
              <span className="text-indigo-400 dark:text-indigo-400">Hikari</span> Weather Assistant 🌤️
            </h1>
            {!compactHeader && (
              <p className="text-gray-500 text-sm">Conversational weather-based recommendations</p>
            )}
          </div>
          <div className={`flex items-center ${compactHeader ? 'gap-2 md:gap-2 flex-nowrap' : 'gap-2 md:gap-3 flex-wrap md:flex-nowrap'}`}>
            {/* City Input */}
            <div className="flex items-center gap-2">
              <label htmlFor="location" className="text-gray-700 dark:text-gray-200 font-medium text-sm">City:</label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={`app-input p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-sm ${compactHeader ? 'w-20 sm:w-24 md:w-28' : 'w-20 sm:w-28 md:w-32'}`}
                placeholder="Tokyo"
                disabled={loading}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="voiceLanguage" className="text-gray-700 dark:text-gray-200 font-medium text-sm">Language:</label>
              <select
                id="voiceLanguage"
                value={voiceLanguage}
                onChange={(e) => setVoiceLanguage(e.target.value)}
                className={`app-select p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-sm ${compactHeader ? 'max-w-[7.5rem]' : ''}`}
                disabled={loading}
              >
                <option value="en-US">English</option>
                <option value="ja-JP">日本語</option>
              </select>
            </div>
            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`px-3 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white/70 shadow-sm hover:bg-white dark:border-gray-600 dark:text-gray-100 dark:bg-white/10 dark:hover:bg-white/15 transition ${compactHeader ? 'text-sm' : ''}`}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-pressed={darkMode}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>{darkMode ? '☀️' : '🌙'}</span>
                <span>{darkMode ? 'Light' : 'Dark'}</span>
              </span>
            </button>
            <button
              onClick={clearChat}
              className={`px-3 py-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white text-sm whitespace-nowrap ${compactHeader ? 'px-2' : ''}`}
            >
              Clear Chat
            </button>
          </div>
        </div>
      </header>

      {/* Chat Messages Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-4 pb-40 flex flex-col">
        <div 
          ref={chatContainerRef}
          className="flex-1 bg-white rounded-lg shadow-lg p-3 sm:p-4 mb-4 pb-28"
        >
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-md px-4 py-2 rounded-lg ${
                  message.type === 'user' 
                    ? 'bg-indigo-500 text-white' 
                    : message.type === 'assistant'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-blue-50 text-blue-800 text-center mx-auto'
                }`}>
                  {message.type === 'assistant' && message.weatherData && (
                    <div className="assistant-card mb-3 p-3 bg-blue-50 border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <span className="mr-1 text-xl">{getWeatherIcon(message.weatherData.condition)}</span>
                          <div className="font-semibold">{message.weatherData.city}</div>
                        </div>
                        <div className="text-2xl font-bold text-indigo-700">{Math.round(message.weatherData.temp)}°C</div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="assistant-pill bg-yellow-100 text-yellow-800 capitalize">{message.weatherData.description}</span>
                        <span className="assistant-pill bg-indigo-100 text-indigo-800">Feels {Math.round(message.weatherData.feelsLike)}°C</span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="assistant-stat bg-white/60 dark:bg-white/5 p-2">
                          <div className="text-gray-600">Humidity</div>
                          <div className="font-semibold">{message.weatherData.humidity}%</div>
                        </div>
                        <div className="assistant-stat bg-white/60 dark:bg-white/5 p-2">
                          <div className="text-gray-600">Wind Speed</div>
                          <div className="font-semibold">{message.weatherData.windSpeed} m/s</div>
                        </div>
                        <div className="assistant-stat bg-white/60 dark:bg-white/5 p-2">
                          <div className="text-gray-600">Visibility</div>
                          <div className="font-semibold">{message.weatherData.visibilityKm != null ? `${message.weatherData.visibilityKm}km` : '—'}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {message.type === 'assistant' ? (
                    <div className="assistant-content" dangerouslySetInnerHTML={formatAssistantHtml(message.content)} />
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                  
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Sources:</p>
                      <div className="space-y-1">
                        {message.sources.slice(0, 2).map((source, index) => (
                          <a 
                            key={index}
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="block text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs opacity-60 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                  <LoadingSpinner />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Error Display */}
        {(error || voiceError) && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-3 rounded mb-4">
            <p className="font-medium text-sm">Error:</p>
            <p className="text-sm">{error || voiceError}</p>
          </div>
        )}

        {/* Message Input Form*/}
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-4xl mx-auto w-full px-4 pt-4 pb-0">
            <form onSubmit={handleSendMessage} className="bg-white/90 dark:bg-[#0b1220]/80 backdrop-blur-md backdrop-saturate-150 border-t border-gray-200/70 dark:border-[#243044]/80 rounded-t-lg shadow-sm p-3 sm:p-4">
              <div className="flex flex-wrap gap-3 items-stretch">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={isListening 
                    ? (voiceLanguage === 'ja-JP' ? '聞いています...' : 'Listening...') 
                    : (voiceLanguage === 'ja-JP' ? '天気、食べ物、アクティビティについて何でも聞いてください...' : 'Ask me anything about weather, food, activities...')}
                  className={`app-input min-w-0 flex-1 p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 ${
                    isListening ? 'bg-indigo-50 border-indigo-500' : ''
                  }`}
                  disabled={loading}
                />

                {isSupported && (
                  <button
                    type="button"
                    onClick={startListening}
                    disabled={loading}
                    className={`p-3 rounded-lg transition duration-150 ease-in-out shadow-md ${
                      isListening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                    } disabled:bg-gray-400`}
                    title={isListening 
                      ? (voiceLanguage === 'ja-JP' ? '音声入力を停止' : 'Stop Voice Input')
                      : (voiceLanguage === 'ja-JP' ? '音声入力を開始' : 'Start Voice Input')
                    }
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 8c1.1 0 2-.9 2-2V3a2 2 0 10-4 0v3c0 1.1.9 2 2 2zM10 18c3.31 0 6-2.69 6-6h-2c0 2.21-1.79 4-4 4s-4-1.79-4-4H4c0 3.31 2.69 6 6 6zM15 9H5a1 1 0 000 2h10a1 1 0 000-2z" />
                    </svg>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading || !userInput.trim() || !location.trim()}
                  className="px-6 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-semibold shadow-md transition duration-150 disabled:bg-gray-400"
                >
                  {loading ? '...' : 'Send'}
                </button>
              </div>
              
              <div className="mt-2 text-xs text-gray-500 text-center">
                Powered by Google Gemini • Weather data from OpenWeatherMap
              </div>
            </form>
          </div>
        </div>
      </main>

      
      {showScrollButton && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="fixed bottom-32 right-4 px-3 py-2 rounded-full shadow-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          aria-label="Scroll to latest message"
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
};

export default App;
