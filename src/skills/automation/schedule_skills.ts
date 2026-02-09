/**
 * Automation Schedule Management Skills
 * Week 2 Feature: Skills for managing automation schedules
 * 
 * NOTE: These skills only manage schedule definitions.
 * Actual execution is locked in Phase 7B.
 */

import type { SkillDefinition } from '../../types/skill';
import type { SkillExecutionContext } from '../../types/skill';
import { ScheduleStore, type ScheduleType } from '../../core/automation/schedule_store';
import * as path from 'node:path';

const scheduleStore = new ScheduleStore({
  storePath: path.join(process.cwd(), 'data', 'schedules')
});

/**
 * List all schedules skill
 */
export const list_schedules: SkillDefinition<
  { skillName?: string; enabled?: boolean; type?: string },
  { schedules: any[]; count: number }
> = {
  name: 'list_schedules',
  description: 'List all automation schedules',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'LOW',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      skillName: { type: 'string' },
      enabled: { type: 'boolean' },
      type: { type: 'string' }
    }
  },
  auditTemplate: {
    action: 'list_schedules',
    target: (input) => input.skillName || 'all'
  },
  handler: async (input, context: SkillExecutionContext) => {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'list_schedules',
      approved: false,
      target: 'schedules',
      result: 'success'
    });

    const schedules = scheduleStore.listSchedules({
      skillName: input.skillName,
      enabled: input.enabled,
      type: input.type as ScheduleType
    });

    return {
      schedules,
      count: schedules.length
    };
  }
};

/**
 * Get a specific schedule skill
 */
export const get_schedule: SkillDefinition<
  { id: string },
  { schedule: any | null }
> = {
  name: 'get_schedule',
  description: 'Get a specific schedule by ID',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'LOW',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  auditTemplate: {
    action: 'get_schedule',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'get_schedule',
      approved: false,
      target: 'schedule',
      result: 'success'
    });

    const schedule = scheduleStore.getSchedule(input.id);

    return {
      schedule: schedule || null
    };
  }
};

/**
 * Create a new schedule skill
 */
export const create_schedule: SkillDefinition<
  {
    id: string;
    name: string;
    description: string;
    type: ScheduleType;
    cronExpression?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    time?: string;
    skillName: string;
    input: Record<string, unknown>;
    requiresApproval: boolean;
    owner: string;
    enabled: boolean;
  },
  { id: string; success: boolean; nextRunAt?: string }
> = {
  name: 'create_schedule',
  description: 'Create a new automation schedule (definition only, execution locked in Phase 7B)',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    required: ['id', 'name', 'description', 'type', 'skillName', 'input', 'requiresApproval', 'owner', 'enabled'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string' },
      cronExpression: { type: 'string' },
      dayOfWeek: { type: 'number' },
      dayOfMonth: { type: 'number' },
      time: { type: 'string' },
      skillName: { type: 'string' },
      input: { type: 'object' },
      requiresApproval: { type: 'boolean' },
      owner: { type: 'string' },
      enabled: { type: 'boolean' }
    }
  },
  auditTemplate: {
    action: 'create_schedule',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    const id = scheduleStore.addSchedule(input);
    const schedule = scheduleStore.getSchedule(id);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'create_schedule',
      approved: true,
      target: 'schedule',
      result: 'success'
    });

    return {
      id,
      success: true,
      nextRunAt: schedule?.nextRunAt
    };
  }
};

/**
 * Preview a schedule skill
 */
export const preview_schedule: SkillDefinition<
  { id: string },
  {
    schedule: any | null;
    willExecute: boolean;
    blockedReason?: string;
    nextRuns: string[];
  }
> = {
  name: 'preview_schedule',
  description: 'Preview what would happen if a schedule were to execute',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'LOW',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  auditTemplate: {
    action: 'preview_schedule',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    const preview = scheduleStore.previewSchedule(input.id);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'preview_schedule',
      approved: false,
      target: 'schedule',
      result: preview ? 'success' : 'not_found'
    });

    if (!preview) {
      return {
        schedule: null,
        willExecute: false,
        blockedReason: 'Schedule not found',
        nextRuns: []
      };
    }

    return preview;
  }
};

/**
 * Update a schedule skill
 */
export const update_schedule: SkillDefinition<
  {
    id: string;
    enabled?: boolean;
    time?: string;
    input?: Record<string, unknown>;
  },
  { success: boolean; schedule: any | null }
> = {
  name: 'update_schedule',
  description: 'Update an existing automation schedule',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
      enabled: { type: 'boolean' },
      time: { type: 'string' },
      input: { type: 'object' }
    }
  },
  auditTemplate: {
    action: 'update_schedule',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    const { id, ...updates } = input;
    const schedule = scheduleStore.updateSchedule(id, updates);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'update_schedule',
      approved: true,
      target: 'schedule',
      result: schedule ? 'success' : 'not_found'
    });

    return {
      success: schedule !== undefined,
      schedule: schedule || null
    };
  }
};

/**
 * Delete a schedule skill
 */
export const delete_schedule: SkillDefinition<
  { id: string },
  { success: boolean }
> = {
  name: 'delete_schedule',
  description: 'Delete an automation schedule',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  auditTemplate: {
    action: 'delete_schedule',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    const success = scheduleStore.deleteSchedule(input.id);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'delete_schedule',
      approved: true,
      target: 'schedule',
      result: success ? 'success' : 'not_found'
    });

    return {
      success
    };
  }
};
