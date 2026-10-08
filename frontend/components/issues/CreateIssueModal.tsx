'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertCircle,
  Tag,
  Paperclip,
  User as UserIcon,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';
import { IssuePriority, Issue, WorkflowState, User, Label } from '@/types';
import { api } from '@/lib/api';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { toast } from 'sonner';

// shadcn UI Components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { StatusIcon } from '@/components/ui/StatusIcon';
import { SignalPriorityIcon } from '@/components/ui/SignalPriorityIcon';

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
  initialStateId?: string;
  states?: WorkflowState[];
  users?: User[];
  labels?: Label[];
  teamKey?: string;
  teamId?: string;
  teams?: { id: string; name: string; key: string }[];
}

const PRIORITY_OPTIONS: { value: IssuePriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No Priority' },
];

export const CreateIssueModal: React.FC<CreateIssueModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialStateId = '',
  states = [],
  users = [],
  labels = [],
  teamKey = '',
  teamId,
  teams = [],
}) => {
  const { organization } = useWorkspace();
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId || '');
  const [teamWorkflowStates, setTeamWorkflowStates] = useState<WorkflowState[]>(states);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('none');
  const [stateId, setStateId] = useState(initialStateId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [availableLabels, setAvailableLabels] = useState<Label[]>(labels);
  const [modalUsers, setModalUsers] = useState<User[]>(users);

  // Popover open states
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);
  const [isPriorityPopoverOpen, setIsPriorityPopoverOpen] = useState(false);
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
  const [isLabelsPopoverOpen, setIsLabelsPopoverOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync available labels when org changes or opens
  useEffect(() => {
    if (isOpen && organization?.id) {
      api.getLabels(organization.id).then((res) => {
        if (res && res.length > 0) {
          setAvailableLabels(res);
        }
      }).catch(() => {});
    }
  }, [isOpen, organization?.id]);

  // Sync initial team
  useEffect(() => {
    if (teamId) {
      setSelectedTeamId(teamId);
    }
  }, [teamId, isOpen]);

  // When selectedTeamId changes, dynamically fetch that team's workflow states & members
  useEffect(() => {
    if (!isOpen || !selectedTeamId) return;

    if (selectedTeamId === teamId && states.length > 0) {
      setTeamWorkflowStates(states);
      return;
    }

    let isMounted = true;
    api.getWorkflowStates(selectedTeamId).then((res) => {
      if (isMounted && res && res.length > 0) {
        setTeamWorkflowStates(res);
        const defaultSt = res.find((s) => s.is_default) || res[0];
        if (defaultSt) {
          setStateId((prev) => prev || defaultSt.id);
        }
      }
    }).catch(() => {});

    api.getTeamMembers(selectedTeamId).then((tms) => {
      if (isMounted && tms && tms.length > 0) {
        setModalUsers(
          tms.map((tm: any) => ({
            id: tm.user_id || tm.id,
            name: tm.user?.name || tm.user?.email || 'Member',
            email: tm.user?.email || '',
          }))
        );
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [selectedTeamId, teamId, isOpen, states]);

  const activeStates = teamWorkflowStates;

  useEffect(() => {
    if (users && users.length > 0 && selectedTeamId === teamId) {
      setModalUsers(users);
    }
  }, [users, selectedTeamId, teamId]);

  useEffect(() => {
    if (activeStates.length > 0) {
      const isCurrentValid = activeStates.some((s) => s.id === stateId);
      if (!isCurrentValid || !stateId) {
        const defaultState = activeStates.find((s) => s.is_default) || activeStates[0];
        if (defaultState) {
          setStateId(defaultState.id);
        }
      }
    }
  }, [selectedTeamId, activeStates, stateId]);

  // Real-time debounced duplicate check
  const [duplicateMatches, setDuplicateMatches] = useState<
    { id: string; title: string; similarity: number; identifier?: string }[]
  >([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (title.trim().length < 10) {
      setDuplicateMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      const res = await api.checkDuplicates(title);
      setDuplicateMatches(res?.duplicates || []);
      setIsCheckingDuplicates(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const resolvedTeamId = selectedTeamId || teamId || states[0]?.team_id;
      const targetState = stateId || activeStates[0]?.id;
      if (!targetState) {
        throw new Error('No workflow state available for selected team.');
      }
      const created = await api.createIssue({
        team_id: resolvedTeamId,
        source_team_id: teamId || undefined,
        title,
        description_text: description,
        priority,
        state_id: targetState,
        assignee_id: assigneeId || undefined,
        label_ids: selectedLabels,
      });
      if (created) {
        toast.success(`Created ${created.identifier || 'issue'}: ${created.title}`);
        onCreated(created);
      }
      onClose();
      setTitle('');
      setDescription('');
      setSelectedLabels([]);
    } catch (err: any) {
      console.error('Failed to create issue', err);
      setSubmitError(err?.message || 'Failed to create issue. Please check fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTeamMeta = teams.find((t) => t.id === selectedTeamId);
  const currentTeamKey = selectedTeamMeta?.key || teamKey || 'TEAM';
  const currentStateObj = activeStates.find((s) => s.id === stateId) || activeStates[0];
  const assignedUser = modalUsers.find((u) => u.id === assigneeId);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-2xl bg-[#191a1d] border border-white/[0.08] text-white p-0 gap-0 rounded-2xl shadow-2xl overflow-hidden [&>button]:hidden font-sans"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Create Issue</DialogTitle>
        </DialogHeader>

        {/* Top Header: Seamless, no bottom border, matching Image 2 */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between select-none">
          {/* Breadcrumb Pill */}
          <div className="flex items-center gap-2">
            {teams.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-xs font-mono font-semibold text-zinc-200 transition-colors cursor-pointer"
                  >
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
                    <span>{currentTeamKey}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#191a1d] border-white/[0.08] text-white">
                  {teams.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => setSelectedTeamId(t.id)}
                      className="text-xs font-mono cursor-pointer flex items-center justify-between"
                    >
                      <span>{t.key} • {t.name}</span>
                      {t.id === selectedTeamId && <Check className="w-3.5 h-3.5 text-zinc-300 ml-2" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] text-xs font-mono font-semibold text-zinc-200">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 shrink-0" />
                <span>{currentTeamKey}</span>
              </div>
            )}

            <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          </div>

          {/* Header Action: Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col">
          {submitError && (
            <div className="mx-6 my-2 p-2.5 rounded-md bg-rose-950/60 border border-rose-800 text-xs text-rose-200">
              {submitError}
            </div>
          )}

          {/* Issue Title Input - Clean borderless */}
          <div className="px-6 pt-2 pb-1">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              className="w-full bg-transparent text-lg font-semibold text-white placeholder:text-zinc-600 focus:outline-none border-0"
            />
          </div>

          {/* Potential Duplicate Match Notice */}
          {duplicateMatches.length > 0 && (
            <div className="mx-6 my-2 p-2.5 bg-amber-950/30 border border-amber-800/60 rounded-md space-y-1.5 font-sans">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Similar issues detected ({duplicateMatches.length}):</span>
              </div>
              <div className="space-y-1">
                {duplicateMatches.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="text-xs text-zinc-300 flex items-center justify-between p-1 rounded bg-zinc-950/50"
                  >
                    <span className="truncate pr-2">{m.title}</span>
                    <span className="text-[10px] text-amber-400 font-mono shrink-0">
                      {Math.round(m.similarity * 100)}% match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issue Description Textarea - Clean borderless */}
          <div className="px-6 pt-1 pb-4">
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description..."
              className="w-full bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none border-0 resize-none leading-relaxed"
            />
          </div>

          {/* Property Pills Row (Linear style matching Image 2, NO line separator) */}
          <div className="px-6 pb-4 flex items-center flex-wrap gap-2 select-none">
            {/* Status Pill */}
            <Popover open={isStatusPopoverOpen} onOpenChange={setIsStatusPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                >
                  <StatusIcon state={currentStateObj} size="xs" />
                  <span>{currentStateObj?.name || 'Todo'}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1 bg-[#191a1d] border-white/[0.08] text-white shadow-2xl rounded-lg">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Change Status
                </div>
                {activeStates.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setStateId(st.id);
                      setIsStatusPopoverOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded hover:bg-white/[0.06] transition-colors cursor-pointer text-left ${
                      st.id === stateId ? 'text-white bg-white/[0.08]' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon state={st} size="xs" />
                      <span>{st.name}</span>
                    </div>
                    {st.id === stateId && <Check className="w-3.5 h-3.5 text-zinc-300" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Priority Pill */}
            <Popover open={isPriorityPopoverOpen} onOpenChange={setIsPriorityPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  <SignalPriorityIcon priority={priority} size="xs" />
                  <span>
                    {priority === 'none' ? 'Priority' : priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1 bg-[#191a1d] border-white/[0.08] text-white shadow-2xl rounded-lg">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Priority
                </div>
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPriority(opt.value);
                      setIsPriorityPopoverOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded hover:bg-white/[0.06] transition-colors cursor-pointer text-left ${
                      priority === opt.value ? 'text-white bg-white/[0.08]' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <SignalPriorityIcon priority={opt.value} size="xs" />
                      <span>{opt.label}</span>
                    </div>
                    {priority === opt.value && <Check className="w-3.5 h-3.5 text-zinc-300" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Assignee Pill */}
            <Popover open={isAssigneePopoverOpen} onOpenChange={setIsAssigneePopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-300 transition-colors cursor-pointer max-w-[200px]"
                >
                  {assignedUser ? (
                    <>
                      <UserAvatar
                        name={assignedUser.name}
                        email={assignedUser.email}
                        size="xs"
                      />
                      <span className="truncate text-zinc-200">
                        {assignedUser.name || assignedUser.email?.split('@')[0]}
                      </span>
                    </>
                  ) : (
                    <>
                      <UserIcon className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Assignee</span>
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1 bg-[#191a1d] border-white/[0.08] text-white shadow-2xl rounded-lg max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Assign To
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAssigneeId('');
                    setIsAssigneePopoverOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded hover:bg-white/[0.06] transition-colors cursor-pointer text-left ${
                    !assigneeId ? 'text-white bg-white/[0.08]' : 'text-zinc-400'
                  }`}
                >
                  <span>Unassigned</span>
                  {!assigneeId && <Check className="w-3.5 h-3.5 text-zinc-300" />}
                </button>
                {modalUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setAssigneeId(u.id);
                      setIsAssigneePopoverOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded hover:bg-white/[0.06] transition-colors cursor-pointer text-left ${
                      assigneeId === u.id ? 'text-white bg-white/[0.08]' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <UserAvatar name={u.name} email={u.email} size="xs" />
                      <span className="truncate">{u.name || u.email}</span>
                    </div>
                    {assigneeId === u.id && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Labels Pill */}
            <Popover open={isLabelsPopoverOpen} onOpenChange={setIsLabelsPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  <Tag className="w-3 h-3 text-zinc-400" />
                  <span>
                    {selectedLabels.length > 0 ? `${selectedLabels.length} labels` : 'Labels'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1 bg-[#191a1d] border-white/[0.08] text-white shadow-2xl rounded-lg max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Labels
                </div>
                {availableLabels.length === 0 ? (
                  <div className="px-2.5 py-2 text-xs text-zinc-500">No labels configured</div>
                ) : (
                  availableLabels.map((lbl) => {
                    const isSelected = selectedLabels.includes(lbl.id);
                    return (
                      <button
                        key={lbl.id}
                        type="button"
                        onClick={() => {
                          setSelectedLabels((prev) =>
                            isSelected ? prev.filter((id) => id !== lbl.id) : [...prev, lbl.id]
                          );
                        }}
                        className={`w-full px-2.5 py-1.5 flex items-center justify-between text-xs rounded hover:bg-white/[0.06] transition-colors cursor-pointer text-left ${
                          isSelected ? 'text-white bg-white/[0.08]' : 'text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: lbl.color || '#a1a1aa' }}
                          />
                          <span>{lbl.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Bottom Footer Bar - Same background, NO line separation */}
          <div className="px-6 pb-5 pt-2 flex items-center justify-between">
            {/* Attachment paperclip circular trigger */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Attach files
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  toast.info(`Selected ${files.length} file(s) for attachment`);
                }
              }}
            />

            {/* Primary CTA Button */}
            <Button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="bg-[#5e6ad2] hover:bg-[#7170ff] text-white font-medium text-xs px-5 py-2 rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create issue'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
