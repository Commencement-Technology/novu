import { useMemo, useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { ActivityFilters } from '@/components/activity/activity-filters';
import { ActivityPanel } from '@/components/activity/activity-panel';
import { ActivityTable } from '@/components/activity/activity-table';
import { DashboardLayout } from '@/components/dashboard-layout';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/primitives/resizable';
import { useActivityUrlState } from '@/hooks/use-activity-url-state';
import { PageMeta } from '../components/page-meta';
import { defaultActivityFilters } from '@/components/activity/constants';
import { usePullActivity } from '@/hooks/use-pull-activity';
import { ActivityHeader } from '@/components/activity/activity-header';
import { ActivityOverview } from '@/components/activity/components/activity-overview';
import { ActivityLogs } from '@/components/activity/activity-logs';
import { ActivitySkeleton } from '@/components/activity/activity-skeleton';
import { ActivityError } from '@/components/activity/activity-error';

export function ActivityFeed() {
  const { activityItemId, filters, filterValues, handleActivitySelect, handleFiltersChange } = useActivityUrlState();
  const { activity, isPending, error } = usePullActivity(activityItemId);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    // Ignore dateRange as it's always present
    if (key === 'dateRange') return false;

    // For arrays, check if they have any items
    if (Array.isArray(value)) return value.length > 0;

    // For other values, check if they exist
    return !!value;
  });

  const handleClearFilters = () => {
    handleFiltersChange(defaultActivityFilters);
  };

  const hasChanges = useMemo(() => {
    return (
      filterValues.dateRange !== defaultActivityFilters.dateRange ||
      filterValues.channels.length > 0 ||
      filterValues.workflows.length > 0 ||
      filterValues.transactionId !== defaultActivityFilters.transactionId ||
      filterValues.subscriberId !== defaultActivityFilters.subscriberId
    );
  }, [filterValues]);

  // Function to handle transaction ID changes with retry logic
  const handleTransactionIdChange = useCallback(
    (newTransactionId: string, activityId?: string) => {
      setIsTransactionLoading(true);

      if (activityId) {
        handleActivitySelect(activityId);
      } else if (newTransactionId) {
        // Update the URL with the new transaction ID
        handleFiltersChange({
          ...filterValues,
          transactionId: newTransactionId,
        });
      } else {
        // Update the URL with the new transaction ID
        handleFiltersChange({
          ...filterValues,
        });
      }

      // Set a timeout to hide the loading state after a reasonable time
      // even if we don't find the activity
      setTimeout(() => {
        setIsTransactionLoading(false);
        setIsTableLoading(false); // Also reset table loading state
      }, 5000); // 5 seconds max loading time
    },
    [filterValues, handleFiltersChange, handleActivitySelect]
  );

  // Handle resend start event
  const handleResendStart = useCallback(() => {
    // setIsTableLoading(true);
  }, []);

  // Reset loading state when activity changes
  useEffect(() => {
    if (activity) {
      setIsTransactionLoading(false);
    }
  }, [activity]);

  return (
    <>
      <PageMeta title="Activity Feed" />
      <DashboardLayout
        headerStartItems={
          <h1 className="text-foreground-950 flex items-center gap-1">
            <span>Activity Feed</span>
          </h1>
        }
      >
        <ActivityFilters
          filters={filterValues}
          onFiltersChange={handleFiltersChange}
          onReset={handleClearFilters}
          showReset={hasChanges}
        />
        <div className="relative flex h-[calc(100vh-98px)]">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={70} minSize={50}>
              <ActivityTable
                selectedActivityId={activityItemId}
                onActivitySelect={handleActivitySelect}
                filters={filters}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={handleClearFilters}
                isLoading={isTableLoading}
              />
            </ResizablePanel>

            <AnimatePresence mode="wait">
              {activityItemId && (
                <>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={35} minSize={35} maxSize={50}>
                    <motion.div
                      key={activityItemId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: 0.2,
                      }}
                      className="bg-background h-full overflow-auto"
                    >
                      <ActivityPanel>
                        {isPending || isTransactionLoading ? (
                          <ActivitySkeleton />
                        ) : error || !activity ? (
                          <ActivityError />
                        ) : (
                          <>
                            <ActivityHeader title={activity.template?.name} />
                            <ActivityOverview activity={activity} />
                            <ActivityLogs
                              activity={activity}
                              onActivitySelect={handleActivitySelect}
                              onTransactionIdChange={handleTransactionIdChange}
                              onResendStart={handleResendStart}
                            />
                          </>
                        )}
                      </ActivityPanel>
                    </motion.div>
                  </ResizablePanel>
                </>
              )}
            </AnimatePresence>
          </ResizablePanelGroup>
        </div>
      </DashboardLayout>
    </>
  );
}
