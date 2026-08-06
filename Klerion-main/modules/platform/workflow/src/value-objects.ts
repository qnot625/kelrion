export type StepType =
  | 'START'
  | 'END'
  | 'MANUAL_TASK'
  | 'AUTOMATIC_TASK'
  | 'APPROVAL_TASK';

export type ConditionOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'CONTAINS'
  | 'IN'
  | 'IS_SET'
  | 'IS_NOT_SET'
  | 'ALWAYS';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: any;
}

export interface TransitionRule {
  targetStepId: string;
  condition?: Condition;
  isDefault?: boolean;
  description?: string;
}

export interface Transition {
  sourceStepId: string;
  targetStepId: string;
  rule: TransitionRule;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  description?: string;
  transitions: TransitionRule[];
  config?: Record<string, any>;
}

export type TriggerType =
  | 'MANUAL'
  | 'EVENT'
  | 'FORM_SUBMISSION'
  | 'SCHEDULED'
  | 'API';

export interface Trigger {
  type: TriggerType;
  eventName?: string;
  formDefinitionId?: string;
  config?: Record<string, any>;
}

export interface WorkflowVariable {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface WorkflowMetadata {
  authorId?: string;
  category?: string;
  tags?: string[];
  description?: string;
  domain?: string;
}

export interface ConditionEvaluator {
  evaluate(condition: Condition, variables: Record<string, any>): boolean;
}

export class DefaultConditionEvaluator implements ConditionEvaluator {
  evaluate(condition: Condition, variables: Record<string, any>): boolean {
    if (condition.operator === 'ALWAYS') {
      return true;
    }

    const val = variables ? variables[condition.field] : undefined;

    switch (condition.operator) {
      case 'EQUALS':
        return val === condition.value;

      case 'NOT_EQUALS':
        return val !== condition.value;

      case 'GREATER_THAN':
        return (
          typeof val === 'number' &&
          typeof condition.value === 'number' &&
          val > condition.value
        );

      case 'LESS_THAN':
        return (
          typeof val === 'number' &&
          typeof condition.value === 'number' &&
          val < condition.value
        );

      case 'CONTAINS':
        if (typeof val === 'string' && typeof condition.value === 'string') {
          return val.includes(condition.value);
        }
        if (Array.isArray(val)) {
          return val.includes(condition.value);
        }
        return false;

      case 'IN':
        if (Array.isArray(condition.value)) {
          return condition.value.includes(val);
        }
        return false;

      case 'IS_SET':
        return val !== undefined && val !== null && val !== '';

      case 'IS_NOT_SET':
        return val === undefined || val === null || val === '';

      default:
        return false;
    }
  }
}
