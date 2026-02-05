import type { SkillDefinition } from "../types/skill";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition<any, any>>();

  register<TIn, TOut>(skill: SkillDefinition<TIn, TOut>) {
    this.skills.set(skill.name, skill as SkillDefinition<any, any>);
  }

  get(name: string) {
    return this.skills.get(name);
  }

  list() {
    return Array.from(this.skills.values());
  }
}
