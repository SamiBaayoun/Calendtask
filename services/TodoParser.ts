import { TFile, Vault } from 'obsidian';
import type { Todo, Priority, Status } from '../types';

/**
 * TodoParser - Parse les fichiers markdown pour extraire les todos
 *
 * Format supporté :
 * - [ ] Task text #tag1 #tag2 @2025-10-06 14:30 !high ⏱60min
 * - [x] Completed task
 * - [>] In progress task
 * - [-] Cancelled task
 */
export class TodoParser {
  constructor() {
  }


  /**
   * Parse une ligne de tâche markdown avec métadonnées inline
   * Format: - [x] Task text #tag @date time !priority ⏱duration
   */
  parseTaskLine(line: string, filePath: string, lineNumber: number): Todo | null {
    // Regex pour détecter une tâche markdown
    const taskRegex = /^[\s-]*\[([ x>\-])\]\s+(.+)$/i;
    const match = line.match(taskRegex);

    if (!match) {
      return null;
    }

    const statusChar = match[1];
    let text = match[2].trim();

    // Extraire les métadonnées
    const tags = this.extractTags(text);
    const { date, time } = this.extractDateTime(text);
    const priority = this.extractPriority(text);
    const duration = this.extractDuration(text);
    const status = this.extractStatus(statusChar);

    // Nettoyer le texte en retirant les métadonnées
    text = this.cleanText(text);

    // Générer un ID unique basé sur le fichier et la ligne
    const id = `${filePath}:${lineNumber}`;

    return {
      id,
      text,
      date,
      time,
      duration,
      tags,
      priority,
      status,
      filePath,
      lineNumber,
    };
  }

  /**
   * Extrait les tags d'une ligne (#tag)
   */
  extractTags(line: string): string[] {
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    const tags: string[] = [];
    let match;

    while ((match = tagRegex.exec(line)) !== null) {
      tags.push(match[1]);
    }

    return tags;
  }

  /**
   * Extrait la date et l'heure (@YYYY-MM-DD HH:MM)
   */
  extractDateTime(line: string): { date?: string; time?: string } {
    // Format: @2025-10-06 14:30 ou @2025-10-06
    const dateTimeRegex = /@(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/;
    const match = line.match(dateTimeRegex);

    if (match) {
      return {
        date: match[1],
        time: match[2] || undefined,
      };
    }

    return {};
  }

  /**
   * Extrait la priorité (!low|medium|high|critical)
   */
  extractPriority(line: string): Priority | undefined {
    const priorityRegex = /!(low|medium|high|critical)/i;
    const match = line.match(priorityRegex);

    if (match) {
      return match[1].toLowerCase() as Priority;
    }

    return undefined;
  }

  /**
   * Extrait la durée (⏱XXmin ou ⏱XXh)
   */
  extractDuration(line: string): number | undefined {
    // Format: ⏱60min ou ⏱2h
    const durationRegex = /⏱(\d+)(min|h)/;
    const match = line.match(durationRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      if (unit === 'h') {
        return value * 60; // Convertir en minutes
      }
      return value;
    }

    return undefined;
  }

  /**
   * Détermine le status depuis le checkbox ([ ], [x], [>], [-])
   */
  extractStatus(char: string): Status {
    switch (char.toLowerCase()) {
      case 'x':
        return 'done';
      case '>':
        return 'in-progress';
      case '-':
        return 'cancelled';
      default:
        return 'todo';
    }
  }

  /**
   * Nettoie le texte en retirant les métadonnées inline
   */
  private cleanText(text: string): string {
    return text
      // Retirer les tags
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      // Retirer la date/heure
      .replace(/@\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/g, '')
      // Retirer la priorité
      .replace(/!(low|medium|high|critical)/gi, '')
      // Retirer la durée
      .replace(/⏱\d+(min|h)/g, '')
      // Nettoyer les espaces multiples
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Construit une ligne de tâche à partir d'un Todo
   */
  buildTaskLine(todo: Todo): string {
    const checkbox = {
      'todo': '[ ]',
      'in-progress': '[>]',
      'done': '[x]',
      'cancelled': '[-]',
    }[todo.status];

    const tags = todo.tags.map(t => `#${t}`).join(' ');
    const dateTime = todo.time
      ? `@${todo.date} ${todo.time}`
      : todo.date
        ? `@${todo.date}`
        : '';
    const priority = todo.priority ? `!${todo.priority}` : '';
    const duration = todo.duration
      ? (todo.duration >= 60
          ? `⏱${Math.round(todo.duration / 60)}h`
          : `⏱${todo.duration}min`)
      : '';

    const parts = [
      `- ${checkbox}`,
      todo.text,
      tags,
      dateTime,
      priority,
      duration,
    ].filter(p => p);

    return parts.join(' ');
  }
}
