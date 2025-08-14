import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';

interface BrowserViewportProps {
  sessionId?: string;
  currentUrl: string;
  isConnected: boolean;
  className?: string;
}

export function BrowserViewport({ sessionId, currentUrl, isConnected, className }: BrowserViewportProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewportScale, setViewportScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      if (iframeRef.current) {
        const container = iframeRef.current.parentElement;
        if (container) {
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight - 60; // Account for header
          
          // Scale to fit container while maintaining aspect ratio
          const scaleX = containerWidth / 1920; // Assume 1920px browser width
          const scaleY = containerHeight / 1080; // Assume 1080px browser height
          const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
          
          setViewportScale(scale);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`h-full bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 ${className}`}>
      {/* Browser Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-2">
            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
          </div>
          <div className="bg-white px-3 py-1 rounded-md border border-gray-200 text-sm font-mono text-gray-600 max-w-md truncate">
            {currentUrl || 'about:blank'}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={isConnected ? 'success' : 'destructive'} className="text-xs">
            <div className={`w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-green-600 animate-pulse' : 'bg-red-600'}`} />
            {isConnected ? 'Live' : 'Disconnected'}
          </Badge>
        </div>
      </div>
      
      {/* Browser Viewport Container with Proper Containment */}
      <div className="relative h-full bg-white overflow-hidden" data-testid="browser-viewport">
        {sessionId ? (
          <iframe
            ref={iframeRef}
            src={`/api/session/${sessionId}/viewport`}
            className="w-full h-full border-0 transform-gpu"
            style={{
              transform: `scale(${viewportScale})`,
              transformOrigin: 'top left',
              width: `${100 / viewportScale}%`,
              height: `${100 / viewportScale}%`,
            }}
            sandbox="allow-same-origin allow-scripts allow-forms"
            data-testid="viewport-iframe"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg font-medium mb-2">Browser Not Started</p>
              <p className="text-gray-400 text-sm">Start an automation session to see live browser activity</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
