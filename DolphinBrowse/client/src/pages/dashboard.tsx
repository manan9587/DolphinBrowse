import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useWebsocket } from '@/hooks/use-websocket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BrowserViewport } from '@/components/browser-viewport';
import { ActivityLog } from '@/components/activity-log';
import { TaskControl } from '@/components/task-control';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useToast } from '@/hooks/use-toast';
import type { ActivityLog as ActivityLogType, Session } from '@shared/schema';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, loading, signOut, checkTrialUsage } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentSession, setCurrentSession] = useState<string>();
  const [sessionStatus, setSessionStatus] = useState<'pending' | 'running' | 'completed' | 'failed' | 'paused'>();
  const [currentUrl, setCurrentUrl] = useState('');
  const [activities, setActivities] = useState<ActivityLogType[]>([]);
  const [remainingTime, setRemainingTime] = useState('15:00');

  const { connected, messages } = useWebsocket(currentSession);
  const lastMessage = messages[messages.length - 1];

  // Check trial usage
  const { data: usageData } = useQuery({
    queryKey: ['/api/usage', user?.id],
    enabled: !!user,
    refetchInterval: 60000, // Refresh every minute
  });

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/login');
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'activity':
          setActivities(prev => [lastMessage.data, ...prev.slice(0, 9)]);
          break;
        case 'status':
          setSessionStatus(lastMessage.data.status);
          if (lastMessage.data.currentUrl) {
            setCurrentUrl(lastMessage.data.currentUrl);
          }
          break;
        case 'error':
          toast({
            title: "Session Error",
            description: lastMessage.data.message,
            variant: "destructive",
          });
          break;
      }
    }
  }, [lastMessage, toast]);

  useEffect(() => {
    if (usageData) {
      const minutesRemaining = Math.max(0, 15 - ((usageData as any)?.minutesUsed || 0));
      const minutes = Math.floor(minutesRemaining);
      const seconds = Math.floor((minutesRemaining - minutes) * 60);
      setRemainingTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }
  }, [usageData]);

  const handleSessionStart = (sessionId: string) => {
    setCurrentSession(sessionId);
    setSessionStatus('running');
    setActivities([]);
    queryClient.invalidateQueries({ queryKey: ['/api/usage'] });
  };

  const handleSessionStop = () => {
    setCurrentSession(undefined);
    setSessionStatus(undefined);
    setCurrentUrl('');
    queryClient.invalidateQueries({ queryKey: ['/api/usage'] });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const getTrialStatus = () => {
    if (!usageData) return "Loading...";
    
    const daysUsed = (usageData as any)?.trialDaysUsed || 0;
    const remainingDays = Math.max(0, 5 - daysUsed);
    
    return `Trial: ${remainingDays}/5 days`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">AgentBrowse</span>
            </div>
            <div className="hidden md:flex space-x-6">
              <span className="text-gray-900 font-medium">Dashboard</span>
              <button 
                onClick={() => setLocation('/pricing')}
                className="text-gray-600 hover:text-gray-900 font-medium"
                data-testid="link-pricing"
              >
                Pricing
              </button>
              {user?.isAdmin && (
                <button 
                  onClick={() => setLocation('/admin')}
                  className="text-gray-600 hover:text-gray-900 font-medium"
                  data-testid="link-admin"
                >
                  Admin
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant="success" className="px-3 py-1">
              <div className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse" />
              {getTrialStatus()}
            </Badge>
            <Button 
              onClick={() => setLocation('/pricing')}
              size="sm"
              data-testid="button-upgrade"
            >
              Upgrade
            </Button>
            <div className="w-8 h-8 bg-gray-300 rounded-full cursor-pointer" onClick={handleSignOut} data-testid="user-avatar">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-xs text-gray-600">{user?.displayName?.[0] || user?.email?.[0] || 'U'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard */}
      <PanelGroup direction="horizontal" className="flex h-screen bg-gray-50">
        <Panel defaultSize={30} className="bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 space-y-4">
            <TaskControl
              onSessionStart={handleSessionStart}
              onSessionStop={handleSessionStop}
              currentSession={currentSession}
              sessionStatus={sessionStatus}
              remainingTime={remainingTime}
            />
          </div>
          <ActivityLog activities={activities} className="flex-1" />
        </Panel>
        <PanelResizeHandle className="w-1 bg-gray-200" />
        <Panel className="flex-1 bg-gray-100 p-6">
          <BrowserViewport
            sessionId={currentSession}
            currentUrl={currentUrl}
            isConnected={connected}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
