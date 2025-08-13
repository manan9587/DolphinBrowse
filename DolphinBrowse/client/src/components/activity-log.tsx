import { useEffect, useRef } from 'react';
import type { ActivityLog } from '@shared/schema';

interface ActivityLogProps {
  activities: ActivityLog[];
  className?: string;
}

const statusColors = {
  info: 'border-blue-500',
  success: 'border-green-500',
  warning: 'border-amber-500',
  error: 'border-red-500',
};

const statusBgColors = {
  info: 'bg-blue-50',
  success: 'bg-green-50',
  warning: 'bg-amber-50',
  error: 'bg-red-50',
};

export function ActivityLog({ activities, className }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // Scroll to top for newest messages
    }
  }, [activities]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={`flex-1 overflow-hidden ${className}`}>
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-md font-medium text-gray-900">Activity Log</h3>
      </div>
      <div 
        ref={scrollRef}
        className="p-6 space-y-4 overflow-y-auto h-full"
        data-testid="activity-log"
      >
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No Activity Yet</p>
            <p className="text-gray-400 text-sm mt-1">Start an automation session to see activity logs</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div 
              key={activity.id}
              className={`border-l-4 pl-4 pb-4 animate-in slide-in-from-left-5 duration-300 ${statusColors[activity.status as keyof typeof statusColors]} ${statusBgColors[activity.status as keyof typeof statusBgColors]} p-3 rounded-r-lg`}
              data-testid={`activity-item-${activity.status}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-900 font-medium">{activity.message}</p>
                  <p className="text-xs text-gray-600 mt-1">Session activity</p>
                </div>
                <span className="text-xs text-gray-500 font-mono" data-testid="activity-timestamp">
                  {activity.timestamp ? formatTime(activity.timestamp) : 'Unknown'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
