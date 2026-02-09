# Week 2 Features: Templates and Automation

## Overview

Week 2 introduces two major features to SAFA OS:
1. **Template Management** - Reusable skill configurations with variable substitution
2. **Automation Scheduling** - Definition and preview of scheduled tasks (execution locked in Phase 7B)

These features enhance SAFA's capabilities while maintaining strict governance and security controls.

## Template Management

### What are Templates?

Templates are reusable configurations for skills that allow you to define patterns once and apply them with different variables. They support variable substitution using the `{{variableName}}` syntax.

### Template Structure

```typescript
{
  id: string;                    // Unique template identifier
  name: string;                  // Human-readable name
  description: string;           // Template description
  category: 'email' | 'call' | 'payment' | 'http' | 'custom';
  skillName: string;             // Target skill name
  template: Record<string, unknown>; // Template with {{variables}}
  variables: string[];           // List of required variables
  owner: string;                 // Template owner
  enabled: boolean;              // Whether template is active
}
```

### Template Skills

#### 1. `list_templates`
List all available templates with optional filtering.

**Usage:**
```bash
node dist/cli/index.js run list_templates --input '{}'
node dist/cli/index.js run list_templates --input '{"category":"email"}'
node dist/cli/index.js run list_templates --input '{"enabled":true}'
```

**Input:**
- `category` (optional): Filter by category (email, call, payment, http, custom)
- `skillName` (optional): Filter by skill name
- `enabled` (optional): Filter by enabled status

**Output:**
- `templates`: Array of template definitions
- `count`: Number of templates

#### 2. `get_template`
Get a specific template by ID.

**Usage:**
```bash
node dist/cli/index.js run get_template --input '{"id":"welcome-email"}'
```

**Input:**
- `id`: Template ID

**Output:**
- `template`: Template definition or null

#### 3. `create_template`
Create a new template (requires approval).

**Usage:**
```bash
node dist/cli/index.js run create_template --approve --input '{
  "id": "welcome-email",
  "name": "Welcome Email Template",
  "description": "Standard welcome email for new users",
  "category": "email",
  "skillName": "send_email",
  "template": {
    "to": "{{userEmail}}",
    "subject": "Welcome to {{productName}}!",
    "body": "Hello {{userName}}, welcome to our platform!"
  },
  "variables": ["userEmail", "userName", "productName"],
  "owner": "admin",
  "enabled": true
}'
```

**Input:**
- All template fields (see Template Structure above)

**Output:**
- `id`: Created template ID
- `success`: Boolean indicating success

#### 4. `apply_template`
Apply a template with variable values to generate skill input.

**Usage:**
```bash
node dist/cli/index.js run apply_template --input '{
  "templateId": "welcome-email",
  "variables": {
    "userEmail": "newuser@example.com",
    "userName": "John Doe",
    "productName": "SAFA OS"
  }
}'
```

**Input:**
- `templateId`: Template ID
- `variables`: Object with variable values

**Output:**
- `input`: Generated skill input (ready to use with target skill)
- `success`: Boolean indicating success

### Template Example Workflow

1. **Create a template:**
```bash
create_template --approve --input '{
  "id": "daily-report",
  "name": "Daily Report Email",
  "category": "email",
  "skillName": "send_email",
  "template": {
    "to": "{{recipient}}",
    "subject": "Daily Report - {{date}}",
    "body": "Report for {{date}}:\\n\\n{{content}}"
  },
  "variables": ["recipient", "date", "content"],
  "owner": "admin",
  "enabled": true
}'
```

2. **Apply the template:**
```bash
apply_template --input '{
  "templateId": "daily-report",
  "variables": {
    "recipient": "manager@company.com",
    "date": "2026-02-09",
    "content": "All systems operational"
  }
}'
```

3. **Result** - Generated input ready for `send_email` skill:
```json
{
  "to": "manager@company.com",
  "subject": "Daily Report - 2026-02-09",
  "body": "Report for 2026-02-09:\n\nAll systems operational"
}
```

## Automation Scheduling

### What is Automation Scheduling?

Automation scheduling allows you to define recurring or one-time scheduled tasks. **Important:** This is a definition-only system in Week 2. Actual execution is locked in Phase 7B for security.

### Schedule Structure

```typescript
{
  id: string;                    // Unique schedule identifier
  name: string;                  // Human-readable name
  description: string;           // Schedule description
  type: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
  
  // Schedule configuration (varies by type)
  cronExpression?: string;       // For cron type
  dayOfWeek?: number;            // 0-6 for weekly
  dayOfMonth?: number;           // 1-31 for monthly
  time?: string;                 // HH:MM format
  
  // Job configuration
  skillName: string;             // Skill to execute
  input: Record<string, unknown>; // Skill input
  requiresApproval: boolean;     // Whether execution needs approval
  
  // Metadata
  owner: string;                 // Schedule owner
  enabled: boolean;              // Whether schedule is active
  nextRunAt?: string;            // Next scheduled run (calculated)
  lastRunAt?: string;            // Last execution (if any)
  runCount: number;              // Number of times executed
}
```

### Schedule Skills

#### 1. `list_schedules`
List all automation schedules.

**Usage:**
```bash
node dist/cli/index.js run list_schedules --input '{}'
node dist/cli/index.js run list_schedules --input '{"enabled":true}'
node dist/cli/index.js run list_schedules --input '{"type":"daily"}'
```

**Input:**
- `skillName` (optional): Filter by skill name
- `enabled` (optional): Filter by enabled status
- `type` (optional): Filter by schedule type

**Output:**
- `schedules`: Array of schedule definitions
- `count`: Number of schedules

#### 2. `get_schedule`
Get a specific schedule by ID.

**Usage:**
```bash
node dist/cli/index.js run get_schedule --input '{"id":"daily-backup"}'
```

**Input:**
- `id`: Schedule ID

**Output:**
- `schedule`: Schedule definition or null

#### 3. `create_schedule`
Create a new automation schedule (requires approval).

**Usage - Daily Schedule:**
```bash
node dist/cli/index.js run create_schedule --approve --input '{
  "id": "daily-report",
  "name": "Daily Status Report",
  "description": "Send daily status report",
  "type": "daily",
  "time": "09:00",
  "skillName": "send_email",
  "input": {
    "to": "team@company.com",
    "subject": "Daily Status",
    "body": "Automated daily report"
  },
  "requiresApproval": false,
  "owner": "admin",
  "enabled": true
}'
```

**Usage - Weekly Schedule:**
```bash
node dist/cli/index.js run create_schedule --approve --input '{
  "id": "weekly-backup",
  "name": "Weekly Backup",
  "description": "Weekly system backup",
  "type": "weekly",
  "dayOfWeek": 1,
  "time": "02:00",
  "skillName": "run_backup",
  "input": {},
  "requiresApproval": true,
  "owner": "admin",
  "enabled": true
}'
```

**Input:**
- All schedule fields (see Schedule Structure above)

**Output:**
- `id`: Created schedule ID
- `success`: Boolean indicating success
- `nextRunAt`: Next scheduled run time (ISO 8601)

#### 4. `preview_schedule`
Preview what would happen if a schedule were to execute.

**Usage:**
```bash
node dist/cli/index.js run preview_schedule --input '{"id":"daily-report"}'
```

**Input:**
- `id`: Schedule ID

**Output:**
```json
{
  "schedule": { /* schedule definition */ },
  "willExecute": false,
  "blockedReason": "PHASE_7B_LOCKED — Execution blocked until Phase 7B activation",
  "nextRuns": [
    "2026-02-10T09:00:00.000Z",
    "2026-02-11T09:00:00.000Z",
    "2026-02-12T09:00:00.000Z",
    "2026-02-13T09:00:00.000Z",
    "2026-02-14T09:00:00.000Z"
  ]
}
```

#### 5. `update_schedule`
Update an existing schedule (requires approval).

**Usage:**
```bash
node dist/cli/index.js run update_schedule --approve --input '{
  "id": "daily-report",
  "enabled": false
}'
```

**Input:**
- `id`: Schedule ID
- `enabled` (optional): Update enabled status
- `time` (optional): Update time
- `input` (optional): Update skill input

**Output:**
- `success`: Boolean indicating success
- `schedule`: Updated schedule or null

#### 6. `delete_schedule`
Delete an automation schedule (requires approval).

**Usage:**
```bash
node dist/cli/index.js run delete_schedule --approve --input '{"id":"daily-report"}'
```

**Input:**
- `id`: Schedule ID

**Output:**
- `success`: Boolean indicating success

### Schedule Types

1. **Once** - One-time execution
   - No additional configuration needed
   - Runs once when enabled

2. **Daily** - Every day at a specific time
   - Requires: `time` (HH:MM format)
   - Example: `"time": "09:00"` runs at 9 AM daily

3. **Weekly** - Specific day of week at a specific time
   - Requires: `dayOfWeek` (0-6, Sunday-Saturday), `time`
   - Example: `"dayOfWeek": 1, "time": "14:00"` runs Mondays at 2 PM

4. **Monthly** - Specific day of month at a specific time
   - Requires: `dayOfMonth` (1-31), `time`
   - Example: `"dayOfMonth": 1, "time": "00:00"` runs first of month at midnight

5. **Cron** - Cron expression (simplified in Week 2)
   - Requires: `cronExpression`
   - Note: Full cron parsing to be implemented in future release

## Security and Governance

### Phase 7B Lock

**Important:** Actual execution of scheduled automations is locked in Phase 7B. The Week 2 implementation provides:
- ✅ Schedule definition and storage
- ✅ Schedule preview and management
- ✅ Next run time calculation
- ❌ Actual execution (blocked)

When you try to preview a schedule that uses a Phase 7B locked skill (send_email, make_call, etc.), you'll see:
```json
{
  "willExecute": false,
  "blockedReason": "PHASE_7B_LOCKED — Execution blocked until Phase 7B activation"
}
```

### Approval Requirements

- Creating templates: **Requires approval** (MEDIUM risk)
- Creating schedules: **Requires approval** (MEDIUM risk)
- Updating schedules: **Requires approval** (MEDIUM risk)
- Deleting schedules: **Requires approval** (MEDIUM risk)
- Listing/viewing: **No approval required** (LOW risk)
- Applying templates: **No approval required** (LOW risk)
- Previewing schedules: **No approval required** (LOW risk)

### Audit Logging

All template and schedule operations are audited:
- `list_templates`, `get_template`, `create_template`, `apply_template`
- `list_schedules`, `get_schedule`, `create_schedule`, `preview_schedule`, `update_schedule`, `delete_schedule`

Check the audit log:
```bash
cat logs/audit.log | grep -E "template|schedule"
```

## Integration Examples

### Using Templates with Schedules

1. Create an email template:
```bash
create_template --approve --input '{
  "id": "weekly-summary",
  "name": "Weekly Summary Email",
  "category": "email",
  "skillName": "send_email",
  "template": {
    "to": "{{recipient}}",
    "subject": "Weekly Summary - Week {{weekNumber}}",
    "body": "Summary:\\n{{summary}}"
  },
  "variables": ["recipient", "weekNumber", "summary"],
  "owner": "admin",
  "enabled": true
}'
```

2. Apply template to generate input:
```bash
apply_template --input '{
  "templateId": "weekly-summary",
  "variables": {
    "recipient": "boss@company.com",
    "weekNumber": "6",
    "summary": "All systems operational"
  }
}'
```

3. Use generated input in a schedule:
```bash
create_schedule --approve --input '{
  "id": "weekly-email",
  "name": "Weekly Email Schedule",
  "description": "Send weekly summary every Monday",
  "type": "weekly",
  "dayOfWeek": 1,
  "time": "09:00",
  "skillName": "send_email",
  "input": {
    "to": "boss@company.com",
    "subject": "Weekly Summary - Week 6",
    "body": "Summary:\\nAll systems operational"
  },
  "requiresApproval": false,
  "owner": "admin",
  "enabled": true
}'
```

## Technical Details

### File Structure
```
src/
├── core/
│   ├── templates/
│   │   └── template_store.ts    # Template storage and management
│   └── automation/
│       └── schedule_store.ts    # Schedule storage and management
└── skills/
    ├── templates/
    │   └── template_skills.ts   # Template management skills
    └── automation/
        └── schedule_skills.ts   # Schedule management skills
```

### Storage

Templates and schedules are stored in memory by default. Persistence to disk can be added by implementing:
- `TemplateStore.exportTemplates()` / `importTemplates()`
- `ScheduleStore.exportSchedules()` / `importSchedules()`

Storage paths:
- Templates: `data/templates/`
- Schedules: `data/schedules/`

## Future Enhancements

### Phase 7B Activation
When Phase 7B is unlocked:
- Schedule execution will be enabled
- Background scheduler daemon will start
- Approval workflows for risky schedules
- Real-time schedule monitoring

### Planned Features
- Template versioning and rollback
- Template inheritance and composition
- Schedule dependencies and chains
- Schedule execution history and logs
- Cron expression parsing and validation
- Schedule conflict detection
- Template and schedule import/export to files
- Dashboard UI for template and schedule management

## Best Practices

1. **Template Naming:** Use descriptive IDs like `welcome-email` not `template1`
2. **Variable Names:** Use clear names like `userName` not `x` or `var1`
3. **Schedule Ownership:** Always specify a clear owner for accountability
4. **Approval Settings:** Set `requiresApproval: true` for risky operations
5. **Testing:** Use `preview_schedule` before enabling schedules
6. **Documentation:** Add clear descriptions to templates and schedules

## Troubleshooting

### Template not applying
- Check if template is enabled: `get_template --input '{"id":"template-id"}'`
- Verify all variables are provided in `apply_template`
- Check variable names match exactly (case-sensitive)

### Schedule not appearing in preview
- Verify schedule exists: `get_schedule --input '{"id":"schedule-id"}'`
- Check if schedule is enabled
- Verify time format is HH:MM (24-hour)

### Phase 7B Locked Error
This is expected! Execution is intentionally locked for security. You can still:
- Create and manage schedules
- Preview what would execute
- See next run times
- Test with `preview_schedule`

## Support

For issues or questions:
- Check audit logs: `cat logs/audit.log`
- Review this documentation
- Check the codebase: `src/core/templates/` and `src/core/automation/`
