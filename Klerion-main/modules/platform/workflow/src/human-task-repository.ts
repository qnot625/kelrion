import { HumanTask, TaskState, TaskPriority } from './human-task.js';

export interface HumanTaskFilter {
  status?: TaskState;
  assigneeId?: string;
  candidateUserId?: string;
  candidateRole?: string;
  workflowInstanceId?: string;
  priority?: TaskPriority;
  search?: string;
}

export interface HumanTaskRepository {
  save(task: HumanTask): Promise<void>;
  findById(id: string, tenantId: string): Promise<HumanTask | null>;
  list(tenantId: string, filter?: HumanTaskFilter): Promise<HumanTask[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
