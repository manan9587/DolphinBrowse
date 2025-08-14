import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Square } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface TaskControlProps {
  onSessionStart: (sessionId: string) => void;
  onSessionStop: () => void;
  currentSession?: string;
  sessionStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  remainingTime?: string;
  className?: string;
}

export function TaskControl({ 
  onSessionStart, 
  onSessionStop, 
  currentSession, 
  sessionStatus,
  remainingTime = '00:00',
  className 
}: TaskControlProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [isStarting, setIsStarting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleStartSession = async () => {
    if (!taskDescription.trim()) {
      toast({
        title: "Task Required",
        description: "Please describe what you want the browser agent to do",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to start a session",
        variant: "destructive",
      });
      return;
    }

    setIsStarting(true);
    try {
      const response = await apiRequest('POST', '/api/sessions', {
        userId: user.id,
        taskDescription: taskDescription.trim(),
        modelUsed: selectedModel,
      });

      const session = await response.json();
      onSessionStart(session.id);
      
      toast({
        title: "Session Started",
        description: "Browser automation has begun",
      });
    } catch (error) {
      console.error('Error starting session:', error);
      toast({
        title: "Error",
        description: "Failed to start automation session",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handlePauseSession = async () => {
    if (!currentSession) return;

    try {
      await apiRequest('PATCH', `/api/sessions/${currentSession}`, {
        status: 'paused',
      });
      
      toast({
        title: "Session Paused",
        description: "Browser automation has been paused",
      });
    } catch (error) {
      console.error('Error pausing session:', error);
      toast({
        title: "Error",
        description: "Failed to pause session",
        variant: "destructive",
      });
    }
  };

  const handleStopSession = async () => {
    if (!currentSession) return;

    try {
      await apiRequest('PATCH', `/api/sessions/${currentSession}`, {
        status: 'completed',
        endTime: new Date().toISOString(),
      });
      
      onSessionStop();
      
      toast({
        title: "Session Stopped",
        description: "Browser automation has been stopped",
      });
    } catch (error) {
      console.error('Error stopping session:', error);
      toast({
        title: "Error",
        description: "Failed to stop session",
        variant: "destructive",
      });
    }
  };

  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';
  const hasActiveSession = currentSession && (isRunning || isPaused);

  return (
    <div className={className}>
      {/* Task Input Section */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Browser Automation</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Task Description
            </label>
            <Textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe what you want the browser agent to do..."
              rows={3}
              disabled={!!hasActiveSession}
              data-testid="task-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={!!hasActiveSession}
            >
              <SelectTrigger data-testid="model-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4">GPT-4 Turbo</SelectItem>
                <SelectItem value="claude-3.5">Claude-3.5</SelectItem>
                <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg flex items-center justify-center">
              <Badge variant="outline" data-testid="remaining-time">
                {remainingTime} remaining today
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex space-x-3">
          {!hasActiveSession ? (
            <Button
              onClick={handleStartSession}
              disabled={isStarting || !taskDescription.trim()}
              variant="success"
              className="flex-1"
              data-testid="button-start"
            >
              <Play className="w-4 h-4 mr-2" />
              {isStarting ? 'Starting...' : 'Start Agent'}
            </Button>
          ) : (
            <>
              {isRunning && (
                <Button
                  onClick={handlePauseSession}
                  variant="warning"
                  data-testid="button-pause"
                >
                  <Pause className="w-4 h-4" />
                </Button>
              )}
              {isPaused && (
                <Button
                  onClick={handleStartSession}
                  variant="success"
                  data-testid="button-resume"
                >
                  <Play className="w-4 h-4" />
                </Button>
              )}
              <Button
                onClick={handleStopSession}
                variant="danger"
                className="flex-1"
                data-testid="button-stop"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Agent
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
