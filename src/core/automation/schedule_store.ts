/**
 * Automation Schedule Definitions
 * Week 2 Feature: Define automation schedules (not execution)
 * 
 * NOTE: Actual execution is locked in Phase 7B. This module only allows
 * defining automation schedules that can be previewed and stored.
 */

import { isPhase7bLockedSkill } from '../phase7b/locked';

export type ScheduleType = 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';

export interface ScheduleDefinition {
  id: string;
  name: string;
  description: string;
  type: ScheduleType;
  
  // Schedule configuration
  cronExpression?: string; // For cron type
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  time?: string; // HH:MM format
  
  // Job configuration
  skillName: string;
  input: Record<string, unknown>;
  requiresApproval: boolean;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  owner: string;
  enabled: boolean;
  
  // Execution tracking (for preview)
  nextRunAt?: string;
  lastRunAt?: string;
  runCount: number;
}

export interface ScheduleStoreOptions {
  storePath: string;
}

/**
 * ScheduleStore manages automation schedule definitions
 * 
 * IMPORTANT: This is a definition-only store. Actual execution
 * is locked in Phase 7B via scheduleWorkflow() and startScheduler().
 * 
 * This allows planning and previewing automation without execution.
 */
export class ScheduleStore {
  private schedules: Map<string, ScheduleDefinition> = new Map();
  private readonly storePath: string;

  constructor(options: ScheduleStoreOptions) {
    this.storePath = options.storePath;
  }

  /**
   * Add a new schedule definition
   * @param schedule Schedule definition
   * @returns Schedule ID
   */
  addSchedule(schedule: Omit<ScheduleDefinition, 'createdAt' | 'updatedAt' | 'runCount'>): string {
    const now = new Date().toISOString();
    const fullSchedule: ScheduleDefinition = {
      ...schedule,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
      nextRunAt: this.calculateNextRun(schedule)
    };
    
    this.schedules.set(schedule.id, fullSchedule);
    return schedule.id;
  }

  /**
   * Get a schedule by ID
   * @param id Schedule ID
   * @returns Schedule definition or undefined
   */
  getSchedule(id: string): ScheduleDefinition | undefined {
    return this.schedules.get(id);
  }

  /**
   * List all schedules, optionally filtered
   * @param filter Optional filter criteria
   * @returns Array of schedule definitions
   */
  listSchedules(filter?: {
    skillName?: string;
    enabled?: boolean;
    type?: ScheduleType;
  }): ScheduleDefinition[] {
    let schedules = Array.from(this.schedules.values());
    
    if (filter?.skillName) {
      schedules = schedules.filter(s => s.skillName === filter.skillName);
    }
    
    if (filter?.enabled !== undefined) {
      schedules = schedules.filter(s => s.enabled === filter.enabled);
    }
    
    if (filter?.type) {
      schedules = schedules.filter(s => s.type === filter.type);
    }
    
    return schedules;
  }

  /**
   * Update an existing schedule
   * @param id Schedule ID
   * @param updates Partial schedule updates
   * @returns Updated schedule or undefined if not found
   */
  updateSchedule(
    id: string,
    updates: Partial<Omit<ScheduleDefinition, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>>
  ): ScheduleDefinition | undefined {
    const existing = this.schedules.get(id);
    if (!existing) {
      return undefined;
    }
    
    const updated: ScheduleDefinition = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      nextRunAt: updates.type || updates.cronExpression || updates.time
        ? this.calculateNextRun({ ...existing, ...updates })
        : existing.nextRunAt
    };
    
    this.schedules.set(id, updated);
    return updated;
  }

  /**
   * Delete a schedule
   * @param id Schedule ID
   * @returns True if deleted, false if not found
   */
  deleteSchedule(id: string): boolean {
    return this.schedules.delete(id);
  }

  /**
   * Preview what would run for a schedule
   * Does NOT execute - returns preview information only
   * 
   * @param id Schedule ID
   * @returns Preview information
   */
  previewSchedule(id: string): {
    schedule: ScheduleDefinition;
    willExecute: boolean;
    blockedReason?: string;
    nextRuns: string[];
  } | undefined {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      return undefined;
    }
    
    let willExecute = schedule.enabled;
    let blockedReason: string | undefined;
    
    // Check if skill is locked in Phase 7B
    if (isPhase7bLockedSkill(schedule.skillName)) {
      willExecute = false;
      blockedReason = 'PHASE_7B_LOCKED — Execution blocked until Phase 7B activation';
    }
    
    // Calculate next 5 run times
    const nextRuns: string[] = [];
    if (schedule.nextRunAt) {
      nextRuns.push(schedule.nextRunAt);
      // Calculate additional runs (simplified - would need proper cron parsing)
      for (let i = 1; i < 5; i++) {
        const next = this.calculateNextRunAfter(schedule, nextRuns[i - 1]);
        if (next) {
          nextRuns.push(next);
        }
      }
    }
    
    return {
      schedule,
      willExecute,
      blockedReason,
      nextRuns
    };
  }

  /**
   * Calculate next run time based on schedule configuration
   * Simplified implementation - real implementation would use a proper cron library
   */
  private calculateNextRun(schedule: Partial<ScheduleDefinition>): string | undefined {
    const now = new Date();
    
    switch (schedule.type) {
      case 'once':
        // For one-time, use current time + 1 minute
        return new Date(now.getTime() + 60000).toISOString();
      
      case 'daily':
        // Next occurrence of specified time today or tomorrow
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          const next = new Date(now);
          next.setHours(hours, minutes, 0, 0);
          
          if (next <= now) {
            next.setDate(next.getDate() + 1);
          }
          
          return next.toISOString();
        }
        break;
      
      case 'weekly':
        // Next occurrence of specified day and time
        if (schedule.dayOfWeek !== undefined && schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          const next = new Date(now);
          next.setHours(hours, minutes, 0, 0);
          
          const daysUntilTarget = (schedule.dayOfWeek - next.getDay() + 7) % 7;
          next.setDate(next.getDate() + daysUntilTarget);
          
          if (next <= now) {
            next.setDate(next.getDate() + 7);
          }
          
          return next.toISOString();
        }
        break;
      
      case 'monthly':
        // Next occurrence of specified day and time
        if (schedule.dayOfMonth && schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          const next = new Date(now);
          next.setDate(schedule.dayOfMonth);
          next.setHours(hours, minutes, 0, 0);
          
          if (next <= now) {
            next.setMonth(next.getMonth() + 1);
          }
          
          return next.toISOString();
        }
        break;
      
      case 'cron':
        // Simplified - would need proper cron parsing library
        return new Date(now.getTime() + 3600000).toISOString();
    }
    
    return undefined;
  }

  /**
   * Calculate next run after a given time
   */
  private calculateNextRunAfter(schedule: ScheduleDefinition, after: string): string | undefined {
    const afterDate = new Date(after);
    
    switch (schedule.type) {
      case 'once':
        return undefined; // One-time schedules don't repeat
      
      case 'daily':
        return new Date(afterDate.getTime() + 86400000).toISOString();
      
      case 'weekly':
        return new Date(afterDate.getTime() + 7 * 86400000).toISOString();
      
      case 'monthly':
        const next = new Date(afterDate);
        next.setMonth(next.getMonth() + 1);
        return next.toISOString();
      
      case 'cron':
        // Simplified
        return new Date(afterDate.getTime() + 3600000).toISOString();
    }
  }

  /**
   * Export all schedules to JSON
   * @returns JSON string of all schedules
   */
  exportSchedules(): string {
    return JSON.stringify(
      Array.from(this.schedules.values()),
      null,
      2
    );
  }

  /**
   * Import schedules from JSON
   * @param json JSON string of schedules
   * @returns Number of schedules imported
   */
  importSchedules(json: string): number {
    try {
      const schedules = JSON.parse(json) as ScheduleDefinition[];
      let count = 0;
      
      for (const schedule of schedules) {
        this.schedules.set(schedule.id, schedule);
        count++;
      }
      
      return count;
    } catch (error) {
      throw new Error(`Failed to import schedules: ${error}`);
    }
  }
}
