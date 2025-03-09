import { motion } from 'motion/react';
import { RiPlayCircleLine, RiFullscreenLine, RiCloseLine } from 'react-icons/ri';
import { IActivity } from '@novu/shared';
import { useState, useRef } from 'react';

import { cn } from '@/utils/ui';
import { InlineToast } from '@/components/primitives/inline-toast';
import { ActivityJobItem } from '@/components/activity/activity-job-item';
import { fadeIn } from '@/utils/animation';
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from '@/components/primitives/popover';
import { CodeBlock } from '@/components/primitives/code-block';
import { Dialog, DialogContent, DialogTitle, DialogClose, DialogHeader } from '@/components/primitives/dialog';
import { CopyToClipboard } from '../primitives/copy-to-clipboard';
import { Button } from '@/components/primitives/button';

export function ActivityLogs({
  activity,
  className,
  onActivitySelect,
  children,
}: {
  activity: IActivity;
  className?: string;
  onActivitySelect: (activityId: string) => void;
  children?: React.ReactNode;
}): JSX.Element {
  const isMerged = activity.jobs.some((job) => job.status === 'merged');
  const { jobs, payload } = activity;
  const [isFullscreenOpen, setIsFullscreenOpenState] = useState(false);
  const popoverCloseRef = useRef<HTMLButtonElement>(null);

  const formattedPayload = payload ? JSON.stringify(payload, null, 2) : '{}';

  const handleResend = () => {
    // Implement resend functionality here
    console.log('Resending payload:', payload);
  };

  const setIsFullscreenOpen = (isOpen: boolean) => {
    if (isOpen && popoverCloseRef.current) {
      popoverCloseRef.current.click();
    }

    setIsFullscreenOpenState(isOpen);
  };

  const closePopover = () => {
    if (popoverCloseRef.current) {
      popoverCloseRef.current.click();
    }
  };

  return (
    <>
      <motion.div
        {...fadeIn}
        className={cn('flex items-center justify-between border-b border-t border-neutral-100 p-2 px-3', className)}
      >
        <div className="flex items-center gap-2">
          <RiPlayCircleLine className="h-3 w-3" />
          <span className="text-foreground-950 text-sm font-medium">Logs</span>
        </div>

        {payload && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-foreground-600 hover:text-foreground-950 text-xs transition-colors">
                View request payload
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="center" side="left">
              <div className="flex items-center justify-between border-b border-neutral-100 p-3">
                <h3 className="text-foreground-950 text-sm font-medium">Request payload</h3>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" mode="ghost" size="sm" onClick={handleResend} className="text-xs">
                    Resend
                  </Button>
                  <Button variant="secondary" mode="ghost" size="sm" className="text-xs" onClick={closePopover}>
                    <RiCloseLine className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="max-h-[400px] overflow-auto p-3">
                <CodeBlock
                  code={formattedPayload}
                  language="json"
                  theme="light"
                  className="h-full"
                  actionButtons={
                    <ActionButtons formattedPayload={formattedPayload} setIsFullscreenOpen={setIsFullscreenOpen} />
                  }
                />
              </div>
              <PopoverClose ref={popoverCloseRef} className="hidden" />
            </PopoverContent>
          </Popover>
        )}
      </motion.div>

      {isMerged && (
        <motion.div {...fadeIn} className="px-3 py-3">
          <InlineToast
            ctaClassName="text-foreground-950"
            variant={'tip'}
            ctaLabel="View Execution"
            onCtaClick={(e) => {
              e.stopPropagation();
              e.preventDefault();

              if (activity._digestedNotificationId) {
                onActivitySelect(activity._digestedNotificationId);
              }
            }}
            description="Remaining execution has been merged to an active Digest of an existing workflow execution."
          />
        </motion.div>
      )}
      <motion.div {...fadeIn} className="flex flex-1 flex-col gap-6 overflow-y-auto bg-white p-3">
        {jobs.map((job, index) => (
          <ActivityJobItem key={job._id} job={job} isFirst={index === 0} isLast={index === jobs.length - 1} />
        ))}
        {children}
      </motion.div>

      {/* Fullscreen Dialog for Payload */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="flex h-[90%] max-h-[90vh] w-[90%] max-w-[90%] flex-col p-0 md:max-w-[80%] lg:max-w-[70%] [&>button.absolute.right-4.top-4]:hidden">
          <DialogHeader className="border-b border-neutral-100 p-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-foreground-950 text-sm font-medium">Request payload</DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="secondary" mode="ghost" size="sm" onClick={handleResend} className="text-xs">
                  Resend
                </Button>
                <DialogClose asChild>
                  <Button variant="secondary" mode="ghost" size="sm" className="text-xs">
                    <RiCloseLine className="h-4 w-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-3">
            <CodeBlock
              code={formattedPayload}
              language="json"
              theme="light"
              className="h-full"
              actionButtons={<CopyToClipboard content={formattedPayload} theme="light" title="Copy code" />}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionButtons({
  formattedPayload,
  setIsFullscreenOpen,
}: {
  formattedPayload: string;
  setIsFullscreenOpen: (isOpen: boolean) => void;
}) {
  const handleFullscreenClick = () => {
    setIsFullscreenOpen(true);
  };

  return (
    <div className="flex items-center gap-1">
      <CopyToClipboard content={formattedPayload} theme="light" title="Copy code" />
      <button
        onClick={handleFullscreenClick}
        className="text-text-sub hover:bg-bg-weak inline-flex select-none items-center justify-center whitespace-nowrap p-2.5 outline-none transition duration-200 ease-out"
      >
        <RiFullscreenLine className="size-3" />
      </button>
    </div>
  );
}
