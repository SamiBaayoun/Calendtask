# Architecture CalendTask

## Vue d'ensemble

CalendTask est un plugin Obsidian qui combine la gestion de tâches et un calendrier hebdomadaire. Les tâches proviennent du vault Obsidian et peuvent être organisées par tags, puis glissées-déposées dans le calendrier pour être planifiées.

---

## 1. Structure des données

### 1.1 Interface Todo

```typescript
interface Todo {
  // Identifiant unique
  id: string;

  // Contenu
  text: string;           // Description de la tâche

  // Temporalité
  date?: string;          // Date au format ISO (YYYY-MM-DD) - optionnelle
  time?: string;          // Heure au format HH:MM - optionnelle
  duration?: number;      // Durée estimée en minutes - optionnelle

  // Organisation
  tags: string[];         // Liste des tags (ex: ["work", "urgent"])
  priority?: 'low' | 'medium' | 'high' | 'critical';

  // Statut
  status: 'todo' | 'in-progress' | 'done' | 'cancelled';

  // Métadonnées Obsidian
  filePath: string;       // Chemin du fichier dans le vault
  lineNumber?: number;    // Numéro de ligne si tâche extraite d'une liste

  // Extras
  recurrence?: RecurrencePattern;  // Pour les tâches récurrentes
  parentRecurrenceId?: string;     // Si c'est une exception à une récurrence
  isRecurrenceException?: boolean; // true si créé comme override d'une instance
  subtasks?: Todo[];      // Sous-tâches
  notes?: string;         // Notes additionnelles
}
```

### 1.2 Interface RecurrencePattern

```typescript
interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;       // Ex: tous les 2 jours
  endDate?: string;       // Date de fin de récurrence
  daysOfWeek?: number[];  // Pour récurrence hebdomadaire (0=dimanche, 6=samedi)
}
```

### 1.3 Interface CalendarEvent

**CalendarEvent est une simple référence vers un Todo**, avec uniquement les informations nécessaires pour distinguer les instances récurrentes :

```typescript
interface CalendarEvent {
  todoId: string;         // Référence vers le Todo source
  instanceDate?: Date;    // Pour récurrences : date de cette occurrence spécifique
}
```

**Pourquoi cette structure légère ?**

1. **Source de vérité unique** : Le Todo contient toutes les données (date, time, duration, tags, etc.)
2. **Pas de duplication** : Évite la synchronisation entre CalendarEvent et Todo
3. **Récurrences simples** : Un Todo récurrent génère plusieurs CalendarEvents avec des `instanceDate` différents
4. **Exceptions** : Une instance modifiée devient un nouveau Todo avec `isRecurrenceException: true`

**Fonctions utilitaires pour calculer les propriétés dérivées :**

```typescript
// Récupérer le todo depuis l'événement
function getTodo(event: CalendarEvent, todos: Todo[]): Todo | undefined {
  return todos.find(t => t.id === event.todoId);
}

// Calculer la date de début (pour affichage calendrier)
function getEventStart(event: CalendarEvent, todos: Todo[]): Date | undefined {
  const todo = getTodo(event, todos);
  if (!todo) return undefined;

  // Pour les récurrences, utiliser instanceDate
  const dateStr = event.instanceDate
    ? formatDate(event.instanceDate)
    : todo.date;

  if (!dateStr) return undefined;

  // Combiner date + time
  if (todo.time) {
    return new Date(`${dateStr}T${todo.time}`);
  }

  return new Date(dateStr);
}

// Calculer la date de fin
function getEventEnd(event: CalendarEvent, todos: Todo[]): Date | undefined {
  const start = getEventStart(event, todos);
  if (!start) return undefined;

  const todo = getTodo(event, todos);
  const duration = todo?.duration || 30; // 30min par défaut

  return new Date(start.getTime() + duration * 60000);
}

// Vérifier si c'est un événement "all-day"
function isAllDayEvent(event: CalendarEvent, todos: Todo[]): boolean {
  const todo = getTodo(event, todos);
  return !!todo?.date && !todo?.time;
}

// Calculer l'index du jour dans la semaine
function getDayIndex(event: CalendarEvent, todos: Todo[], weekStart: Date): number | undefined {
  const start = getEventStart(event, todos);
  if (!start) return undefined;

  const daysSinceWeekStart = Math.floor((start.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
  return daysSinceWeekStart;
}

// Vérifier si c'est une instance récurrente (vs un todo normal)
function isRecurringInstance(event: CalendarEvent): boolean {
  return !!event.instanceDate;
}
```

### 1.4 Interface TagGroup

```typescript
interface TagGroup {
  tag: string;
  todos: Todo[];
  isCollapsed: boolean;   // État du fold/unfold
  color?: string;         // Couleur personnalisée pour le tag
}
```

---

## 2. Parsing des Tâches depuis Obsidian

### 2.1 Format Markdown supporté

Les tâches sont définies dans des listes Markdown avec syntaxe inline :

```markdown
- [ ] Préparer la présentation #work #urgent @2025-10-06 14:30 !high ⏱60min
- [x] Faire les courses #perso @2025-10-05
- [ ] Appeler le client #work @2025-10-07
- [>] Développer la feature X #dev @2025-10-08 09:00 !critical ⏱2h
```

**Syntaxe des métadonnées inline :**
- `#tag` : Tag (plusieurs tags possibles)
- `@YYYY-MM-DD HH:MM` : Date et heure (heure optionnelle)
- `!low|medium|high|critical` : Priorité
- `⏱XXmin` ou `⏱XXh` : Durée estimée
- `[ ]` : Todo (à faire)
- `[x]` : Done (terminé)
- `[>]` : In progress (en cours)
- `[-]` : Cancelled (annulé)

### 2.2 Parser les fichiers

```typescript
class TodoParser {
  // Parse tous les fichiers markdown du vault
  async parseTodosFromVault(vault: Vault): Promise<Todo[]>;

  // Parse un fichier spécifique
  async parseTodoFromFile(file: TFile): Promise<Todo[]>;

  // Parse une ligne de tâche markdown avec métadonnées inline
  parseTaskLine(line: string, filePath: string, lineNumber: number): Todo | null;

  // Extrait les tags d'une ligne (#tag)
  extractTags(line: string): string[];

  // Extrait la date et l'heure (@YYYY-MM-DD HH:MM)
  extractDateTime(line: string): { date?: string; time?: string };

  // Extrait la priorité (!low|medium|high|critical)
  extractPriority(line: string): Priority | undefined;

  // Extrait la durée (⏱XXmin ou ⏱XXh)
  extractDuration(line: string): number | undefined;

  // Détermine le status depuis le checkbox ([ ], [x], [>], [-])
  extractStatus(line: string): Status;
}
```

---

## 3. Organisation de l'UI

### 3.1 TodoColumn (barre de gauche)

**Structure visuelle :**

```
┌─────────────────────────────┐
│   🔍 Rechercher...          │
├─────────────────────────────┤
│ ▼ 🏷️ work (5)              │
│   ├─ [H] Préparer présent.. │
│   ├─ [M] Code review       │
│   └─ [L] Documentation     │
├─────────────────────────────┤
│ ▶ 🏷️ perso (3)             │
├─────────────────────────────┤
│ ▼ 🏷️ urgent (2)            │
│   └─ [C] Appeler client    │
├─────────────────────────────┤
│ ▼ 📋 Sans tag (1)           │
│   └─ [M] Tâche sans tag    │
└─────────────────────────────┘
```

**Composant TodoItem :**
```
┌────────────────────────────────┐
│ [H] Préparer présentation     │
│ 📅 06/10 ⏰ 14:30 ⏱ 1h        │
└────────────────────────────────┘
```

**Légende des icônes de priorité :**
- `[C]` : Critical (rouge)
- `[H]` : High (orange)
- `[M]` : Medium (jaune)
- `[L]` : Low (vert)

**Fonctionnalités :**
- Clic sur `▼/▶` : fold/unfold le groupe de tags
- Drag & drop : vers le calendrier
- **Double-clic** : ouvre le fichier source avec focus sur la ligne du todo
- Clic droit : menu contextuel (éditer, supprimer, etc.)
- Recherche : filtre les todos en temps réel

### 3.2 CalendarView (vue hebdomadaire)

**Structure :**

```
┌────────────────────────────────────────────────────────────┐
│  < >  Octobre 2025                                         │
├─────┬──────┬──────┬──────┬──────┬──────┬──────┬──────────┤
│     │ LUN  │ MAR  │ MER  │ JEU  │ VEN  │ SAM  │ DIM      │
│     │  30  │  31  │   1  │   2  │   3  │   4  │   5      │
├─────┼──────┼──────┼──────┼──────┼──────┼──────┼──────────┤
│     │┌────┐│      │      │      │      │      │          │
│     ││All ││      │      │      │      │      │          │
│     ││Day ││      │      │      │      │      │          │
│     │└────┘│      │      │      │      │      │          │
├─────┼──────┼──────┼──────┼──────┼──────┼──────┼──────────┤
│00:00│      │      │      │      │      │      │          │
│01:00│      │      │      │      │      │      │          │
│02:00│      │      │      │      │      │      │          │
│ ... │      │      │      │      │      │      │          │
│14:00│      │      │┌────┐│      │      │      │          │
│     │      │      ││Task││      │      │      │          │
│15:00│      │      │└────┘│      │      │      │          │
│ ... │      │      │      │      │      │      │          │
│23:00│      │      │      │      │      │      │          │
└─────┴──────┴──────┴──────┴──────┴──────┴──────┴──────────┘
```

**Zone "All-Day" :**
- Située en haut de chaque colonne de jour
- Hauteur variable selon le nombre de tâches
- Affiche les tâches avec date mais sans heure
- Drop zone pour placer des tâches "toute la journée"

**Zone horaire (grid) :**
- 24 lignes (00:00 - 23:00)
- Hauteur fixe par heure : 40px
- Tâches positionnées selon start/end time
- Redimensionnables (poignées haut/bas)
- Snapping à 30 minutes

**Événement calendrier :**
```
┌────────────────────────────────┐
│ [H] Préparer présentation     │
│ 14:30 - 15:30 (1h)            │
└────────────────────────────────┘
```

**Interactions :**
- **Double-clic** : ouvre le fichier source avec focus sur la ligne du todo
- Drag : déplacer l'événement vers un autre jour/heure
- Resize (poignées haut/bas) : ajuster la durée
- Clic droit : menu contextuel (éditer, supprimer, etc.)

---

## 4. Logique de placement automatique

### 4.1 Règles de placement initial

```typescript
function placeTodoInCalendar(todo: Todo): CalendarEvent | null {
  // Cas 1 : Pas de date → reste dans TodoColumn
  if (!todo.date) {
    return null;
  }

  // Cas 2 & 3 : Le todo a une date (avec ou sans heure) → créer un événement calendrier
  // La structure CalendarEvent est très simple : juste une référence
  return {
    todoId: todo.id
    // Pas de instanceDate car ce n'est pas une récurrence
  };
}

// Note : Les propriétés comme dayIndex, start, end, isAllDay
// sont calculées à la volée avec les fonctions utilitaires
// getEventStart(), getEventEnd(), isAllDayEvent(), etc.
```

### 4.2 Synchronisation avec Obsidian

Lorsqu'un todo est déplacé dans le calendrier, mettre à jour le fichier source :

```typescript
async function updateTodoInVault(todo: Todo, newDate: string, newTime?: string) {
  const file = vault.getAbstractFileByPath(todo.filePath);
  if (!file) return;

  const content = await vault.read(file);

  // Mise à jour de la ligne de tâche avec les nouvelles métadonnées
  const updatedContent = updateTaskLine(content, todo.lineNumber, newDate, newTime);

  await vault.modify(file, updatedContent);
}

// Fonction helper pour mettre à jour une ligne de tâche
function updateTaskLine(content: string, lineNumber: number, newDate: string, newTime?: string): string {
  const lines = content.split('\n');
  const line = lines[lineNumber];

  // Supprimer l'ancienne date/heure si présente
  let updatedLine = line.replace(/@\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2})?/g, '');

  // Ajouter la nouvelle date/heure
  const dateTimeStr = newTime ? `@${newDate} ${newTime}` : `@${newDate}`;
  updatedLine = updatedLine.replace(/^(- \[.\] .+?)(\s*#|$)/, `$1 ${dateTimeStr}$2`);

  lines[lineNumber] = updatedLine;
  return lines.join('\n');
}
```

### 4.3 Impact des modifications dans le calendrier

Toute modification d'un événement dans le calendrier entraîne une **synchronisation bidirectionnelle** avec le fichier markdown source.

#### Tableau des scénarios de modification

| Action utilisateur | Impact sur le calendrier | Impact sur le fichier markdown | Exemple |
|-------------------|-------------------------|-------------------------------|---------|
| **Drag horizontal** (changement de jour) | Déplace l'événement vers une autre colonne | Met à jour `@YYYY-MM-DD` | `@2025-10-06 14:30` → `@2025-10-08 14:30` |
| **Drag vertical** (changement d'heure) | Déplace l'événement dans la grille horaire | Met à jour `HH:MM` | `@2025-10-06 14:30` → `@2025-10-06 10:00` |
| **Resize** (poignée du bas) | Étend/réduit la hauteur de l'événement | Met à jour `⏱XXmin` ou `⏱XXh` | `⏱60min` → `⏱90min` |
| **Drag vers zone "all-day"** | Place l'événement dans la zone en haut | Supprime l'heure, garde la date | `@2025-10-06 14:30` → `@2025-10-06` |
| **Drag depuis "all-day" vers grid** | Place l'événement dans la grille horaire | Ajoute l'heure à la date | `@2025-10-06` → `@2025-10-06 10:00` |
| **Suppression** (clic droit → supprimer) | Retire l'événement du calendrier | Change `[ ]` en `[x]` ou supprime la date | `@2025-10-06 14:30` → (vide) |
| **Changement de statut** | Met à jour l'apparence visuelle | Change `[ ]` en `[x]`, `[>]`, ou `[-]` | `- [ ] Tâche` → `- [x] Tâche` |

#### Synchronisation en temps réel

```typescript
// Exemple : Drag d'un événement vers un nouveau jour/heure
async function handleEventDrop(event: CalendarEvent, newDay: Date, newHour: number, newMinutes: number) {
  const newDate = `${newDay.getFullYear()}-${String(newDay.getMonth() + 1).padStart(2, '0')}-${String(newDay.getDate()).padStart(2, '0')}`;
  const newTime = `${String(newHour).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;

  // Récupérer le todo référencé
  const todo = getTodo(event, todos);
  if (!todo) return;

  // Mettre à jour le todo dans le store
  todo.date = newDate;
  todo.time = newTime;

  // Synchroniser avec le fichier source
  await updateTodoInVault(todo, newDate, newTime);

  // Rafraîchir l'affichage (pas besoin de modifier calendarEvents, juste forcer le re-render)
  todos = [...todos];
}
```

#### Gestion des conflits

**Cas 1 : Fichier modifié manuellement pendant que le plugin est ouvert**

```typescript
// Watcher sur les fichiers du vault
vault.on('modify', async (file: TFile) => {
  // Re-parser le fichier
  const updatedTodos = await todoParser.parseTodoFromFile(file);

  // Mettre à jour le store des todos
  todos = todos.map(todo => {
    const updated = updatedTodos.find(t => t.id === todo.id);
    return updated || todo;
  });

  // Nettoyer les événements dont le todo n'a plus de date
  calendarEvents = calendarEvents.filter(event => {
    const todo = getTodo(event, todos);
    return todo && todo.date; // Garde seulement si le todo existe et a une date
  });

  // Ajouter des événements pour les nouveaux todos avec date
  const newEvents = updatedTodos
    .filter(t => t.date && !calendarEvents.some(e => e.todoId === t.id))
    .map(t => ({ todoId: t.id }));

  calendarEvents = [...calendarEvents, ...newEvents];
});
```

**Cas 2 : Fichier source supprimé**

```typescript
vault.on('delete', (file: TFile) => {
  // Récupérer les IDs des todos supprimés avant de les retirer
  const deletedTodoIds = todos
    .filter(todo => todo.filePath === file.path)
    .map(todo => todo.id);

  // Retirer tous les todos provenant de ce fichier
  todos = todos.filter(todo => todo.filePath !== file.path);

  // Retirer les événements calendrier correspondants
  calendarEvents = calendarEvents.filter(event =>
    !deletedTodoIds.includes(event.todoId)
  );

  // Notifier l'utilisateur
  new Notice(`Todos supprimés : ${file.path}`);
});
```

**Cas 3 : Ligne modifiée/supprimée manuellement**

```typescript
// Lors du re-parsing, si un todo n'existe plus à sa ligne d'origine
function reconcileTodos(oldTodos: Todo[], newTodos: Todo[]): Todo[] {
  return newTodos.map(newTodo => {
    // Trouver le todo correspondant (par ID ou par contenu similaire)
    const oldTodo = oldTodos.find(t => t.id === newTodo.id);

    if (!oldTodo) {
      // Nouveau todo détecté
      return newTodo;
    }

    if (oldTodo.lineNumber !== newTodo.lineNumber) {
      // La ligne a changé (insertion/suppression au-dessus)
      console.log(`Todo ${newTodo.id} moved from line ${oldTodo.lineNumber} to ${newTodo.lineNumber}`);
    }

    return newTodo;
  });
}
```

#### Historique et annulation

Les modifications sont enregistrées dans le fichier markdown, donc :

- **Undo/Redo Obsidian** : Utilisez `Ctrl+Z` / `Ctrl+Y` dans l'éditeur
- **Historique Git** : Si le vault est versionné, chaque modification est tracée
- **Obsidian Core Plugins** : Le plugin "File Recovery" peut restaurer des versions précédentes

#### Notifications de synchronisation

```typescript
// Afficher une notification discrète lors des modifications
async function updateTodoInVault(todo: Todo, newDate: string, newTime?: string) {
  const file = vault.getAbstractFileByPath(todo.filePath);
  if (!file) {
    new Notice('❌ Fichier introuvable', 2000);
    return;
  }

  const content = await vault.read(file);
  const updatedContent = updateTaskLine(content, todo.lineNumber, newDate, newTime);

  await vault.modify(file, updatedContent);

  // Notification optionnelle (peut être désactivée dans les settings)
  if (settings.showSyncNotifications) {
    new Notice('✅ Todo synchronisé', 1000);
  }
}
```

---

## 5. Fonctionnalités avancées

### 5.1 Ouvrir le fichier source (double-clic)

Lorsqu'un utilisateur double-clique sur un todo (dans TodoColumn ou CalendarView), ouvrir le fichier source dans l'éditeur Obsidian avec le curseur positionné sur la ligne du todo :

```typescript
// utils/editorUtils.ts
import { App, TFile, Editor } from 'obsidian';

async function openTodoInEditor(app: App, todo: Todo) {
  // Récupérer le fichier
  const file = app.vault.getAbstractFileByPath(todo.filePath);
  if (!(file instanceof TFile)) {
    console.error('File not found:', todo.filePath);
    return;
  }

  // Ouvrir le fichier dans une nouvelle feuille ou la feuille active
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);

  // Attendre que l'éditeur soit prêt
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return;

  const editor = view.editor;

  // Positionner le curseur sur la ligne du todo
  if (todo.lineNumber !== undefined) {
    const line = todo.lineNumber;
    editor.setCursor({ line, ch: 0 });

    // Scroller pour centrer la ligne dans la vue
    editor.scrollIntoView({
      from: { line, ch: 0 },
      to: { line, ch: 0 }
    }, true);

    // Optionnel : sélectionner toute la ligne pour la mettre en évidence
    const lineContent = editor.getLine(line);
    editor.setSelection(
      { line, ch: 0 },
      { line, ch: lineContent.length }
    );
  }
}

export { openTodoInEditor };
```

**Utilisation dans les composants :**

```typescript
// TodoItem.svelte
<script lang="ts">
  import { openTodoInEditor } from '../utils/editorUtils';
  import { getContext } from 'svelte';

  export let todo: Todo;
  const app = getContext('app'); // App Obsidian passé via context

  function handleDoubleClick() {
    openTodoInEditor(app, todo);
  }
</script>

<div class="todo-item" on:dblclick={handleDoubleClick}>
  {todo.text}
</div>
```

```typescript
// CalendarEvent.svelte
<script lang="ts">
  import { openTodoInEditor } from '../utils/editorUtils';
  import { getContext } from 'svelte';

  export let event: CalendarEvent;
  const app = getContext('app');

  function handleDoubleClick() {
    openTodoInEditor(app, event.todo);
  }
</script>

<div class="calendar-event" on:dblclick={handleDoubleClick}>
  {event.todo.text}
</div>
```

**Passage du contexte Obsidian App :**

Dans `CalendTaskView.ts`, passer l'instance `app` aux composants Svelte :

```typescript
this.todoColumn = mount(TodoColumn, {
  target: todoColumnEl,
  context: new Map([['app', this.app]])
});

this.calendarView = mount(CalendarView, {
  target: calendarViewEl,
  context: new Map([['app', this.app]])
});
```

### 5.2 Drag & drop des événements calendrier

Les événements calendrier peuvent être déplacés et redimensionnés. Voici comment implémenter ces interactions :

```typescript
// CalendarEvent.svelte
<script lang="ts">
  export let event: CalendarEvent;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // Drag de l'événement complet (déplacer jour/heure)
  function handleEventDragStart(e: DragEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    // Transmettre les données de l'événement
    e.dataTransfer?.setData('text/plain', JSON.stringify({
      type: 'calendar-event',
      eventId: event.id
    }));
  }

  function handleEventDragEnd() {
    isDragging = false;
  }
</script>

<div
  class="calendar-event"
  draggable="true"
  on:dragstart={handleEventDragStart}
  on:dragend={handleEventDragEnd}
  on:dblclick={handleDoubleClick}
>
  {event.todo.text}
  <div class="resize-handle top" on:mousedown={(e) => handleResizeStart(e, 'top')}></div>
  <div class="resize-handle bottom" on:mousedown={(e) => handleResizeStart(e, 'bottom')}></div>
</div>
```

**Gestion du drop dans CalendarView.svelte :**

```typescript
async function handleEventDrop(e: DragEvent, targetDay: Date, targetHour: number) {
  e.preventDefault();

  const data = JSON.parse(e.dataTransfer?.getData('text/plain') || '{}');

  if (data.type === 'calendar-event') {
    // Déplacement d'un événement existant
    const event = calendarEvents.find(evt => evt.id === data.eventId);
    if (!event) return;

    // Calculer la nouvelle heure basée sur offsetY
    const cellHeight = 40; // 40px par heure
    const minutes = Math.round((e.offsetY / cellHeight) * 60 / 30) * 30; // Snap to 30min

    const newDate = formatDate(targetDay);
    const newTime = `${String(targetHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    // Mettre à jour l'événement
    event.todo.date = newDate;
    event.todo.time = newTime;
    event.start = new Date(`${newDate}T${newTime}`);
    event.end = new Date(event.start.getTime() + (event.todo.duration || 30) * 60000);
    event.dayIndex = daysInWeek.findIndex(d => d.toDateString() === targetDay.toDateString());

    // Synchroniser avec le fichier
    await updateTodoInVault(event.todo, newDate, newTime);

    // Mettre à jour également la durée si elle a changé
    if (event.todo.duration) {
      await updateTodoDuration(event.todo, event.todo.duration);
    }

    calendarEvents = [...calendarEvents];
  }
}
```

**Mise à jour de la durée lors du resize :**

```typescript
// Fonction helper pour mettre à jour la durée dans le fichier
function updateTodoDuration(todo: Todo, newDurationMinutes: number): string {
  const lines = content.split('\n');
  const line = lines[todo.lineNumber];

  // Supprimer l'ancienne durée
  let updatedLine = line.replace(/⏱\d+(?:min|h)/g, '');

  // Ajouter la nouvelle durée
  const durationStr = newDurationMinutes >= 60
    ? `⏱${Math.round(newDurationMinutes / 60)}h`
    : `⏱${newDurationMinutes}min`;

  // Insérer avant les tags ou à la fin
  updatedLine = updatedLine.replace(/^(- \[.\] .+?)(\s*#|$)/, `$1 ${durationStr}$2`);

  lines[todo.lineNumber] = updatedLine;
  return lines.join('\n');
}
```

### 5.3 Suppression et changement de statut

**Suppression d'un événement :**

```typescript
// Menu contextuel (clic droit)
function handleEventRightClick(e: MouseEvent, event: CalendarEvent) {
  e.preventDefault();

  const menu = new Menu();

  menu.addItem((item) => {
    item.setTitle('Supprimer la date')
      .setIcon('calendar-x')
      .onClick(async () => {
        // Retirer la date/heure du todo
        event.todo.date = undefined;
        event.todo.time = undefined;

        // Mettre à jour le fichier (supprimer @date)
        await removeDateFromTodo(event.todo);

        // Retirer l'événement du calendrier
        calendarEvents = calendarEvents.filter(e => e.id !== event.id);

        // Le todo retourne dans la TodoColumn
        todos = [...todos];
      });
  });

  menu.addItem((item) => {
    item.setTitle('Marquer comme terminé')
      .setIcon('check')
      .onClick(async () => {
        await updateTodoStatus(event.todo, 'done');
        event.todo.status = 'done';
        calendarEvents = [...calendarEvents];
      });
  });

  menu.showAtMouseEvent(e);
}
```

**Mise à jour du statut :**

```typescript
async function updateTodoStatus(todo: Todo, newStatus: Status) {
  const file = vault.getAbstractFileByPath(todo.filePath);
  if (!file) return;

  const content = await vault.read(file);
  const lines = content.split('\n');
  const line = lines[todo.lineNumber];

  // Mapper le statut vers le format checkbox
  const statusMap = {
    'todo': '[ ]',
    'in-progress': '[>]',
    'done': '[x]',
    'cancelled': '[-]'
  };

  const newCheckbox = statusMap[newStatus];
  const updatedLine = line.replace(/- \[.\]/, `- ${newCheckbox}`);

  lines[todo.lineNumber] = updatedLine;
  await vault.modify(file, lines.join('\n'));
}
```

### 5.4 Gestion des tâches récurrentes

#### Génération des instances récurrentes

Une tâche récurrente génère automatiquement plusieurs instances dans le calendrier :

```typescript
function generateRecurringEvents(todo: Todo, startWeek: Date, endWeek: Date): CalendarEvent[] {
  if (!todo.recurrence) return [];

  const events: CalendarEvent[] = [];
  let currentDate = new Date(todo.date);

  // Récupérer les exceptions existantes pour cette récurrence
  const exceptions = todos.filter(t =>
    t.parentRecurrenceId === todo.id &&
    t.isRecurrenceException
  );

  while (currentDate <= endWeek) {
    if (currentDate >= startWeek) {
      const dateStr = formatDate(currentDate);

      // Vérifier si une exception existe pour cette date
      const exception = exceptions.find(e => e.date === dateStr);

      if (exception) {
        // Utiliser le todo d'exception au lieu de l'instance générée
        events.push({ todoId: exception.id });
      } else {
        // Créer une instance récurrente normale
        events.push({
          todoId: todo.id,
          instanceDate: currentDate
        });
      }
    }
    currentDate = addInterval(currentDate, todo.recurrence);
  }

  return events;
}
```

#### Modification d'une instance récurrente : Popup de confirmation

Lorsqu'un utilisateur modifie une instance d'un todo récurrent (déplacement, resize, etc.), afficher une modale pour demander le choix :

```typescript
// components/RecurrenceChoiceModal.ts
import { App, Modal } from 'obsidian';

type RecurrenceChoice = 'this-instance' | 'all-instances';

export class RecurrenceChoiceModal extends Modal {
  private resolve: (choice: RecurrenceChoice | null) => void;
  private action: string; // "déplacer", "modifier", "supprimer", etc.

  constructor(app: App, action: string) {
    super(app);
    this.action = action;
  }

  async openAndWait(): Promise<RecurrenceChoice | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Tâche récurrente' });
    contentEl.createEl('p', {
      text: `Voulez-vous ${this.action} cette instance seulement ou toutes les instances futures ?`
    });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    // Bouton "Cette instance seulement"
    const thisInstanceBtn = buttonContainer.createEl('button', {
      text: 'Cette instance seulement',
      cls: 'mod-cta'
    });
    thisInstanceBtn.addEventListener('click', () => {
      this.resolve('this-instance');
      this.close();
    });

    // Bouton "Toutes les instances"
    const allInstancesBtn = buttonContainer.createEl('button', {
      text: 'Toutes les instances',
    });
    allInstancesBtn.addEventListener('click', () => {
      this.resolve('all-instances');
      this.close();
    });

    // Bouton "Annuler"
    const cancelBtn = buttonContainer.createEl('button', {
      text: 'Annuler',
    });
    cancelBtn.addEventListener('click', () => {
      this.resolve(null);
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

#### Logique de modification selon le choix utilisateur

```typescript
// Exemple : Déplacement d'un événement récurrent
async function handleRecurringEventDrop(
  event: CalendarEvent,
  newDay: Date,
  newTime: string
) {
  // Récupérer le todo référencé
  const todo = getTodo(event, todos);
  if (!todo) return;

  // Vérifier si c'est une instance récurrente
  if (!isRecurringInstance(event)) {
    // Todo normal, modification directe
    await updateTodoInVault(todo, formatDate(newDay), newTime);
    return;
  }

  // Demander à l'utilisateur
  const modal = new RecurrenceChoiceModal(app, 'déplacer');
  const choice = await modal.openAndWait();

  if (!choice) return; // Annulé

  if (choice === 'all-instances') {
    // Modifier le todo parent (toutes les instances futures)
    todo.date = formatDate(newDay);
    todo.time = newTime;
    await updateTodoInVault(todo, formatDate(newDay), newTime);

    // Rafraîchir (les CalendarEvents seront recalculés à la volée)
    todos = [...todos];

  } else if (choice === 'this-instance') {
    // Créer un todo d'exception pour cette instance spécifique
    const exceptionTodo: Todo = {
      id: generateId(),
      text: todo.text,
      date: formatDate(newDay),
      time: newTime,
      duration: todo.duration,
      tags: [...todo.tags],
      priority: todo.priority,
      status: todo.status,
      filePath: todo.filePath,
      lineNumber: undefined, // Sera déterminé lors de l'ajout
      parentRecurrenceId: todo.id,
      isRecurrenceException: true
    };

    // Ajouter cette exception dans le fichier
    await addTodoToVault(exceptionTodo);

    // Mettre à jour le store
    todos = [...todos, exceptionTodo];

    // Remplacer l'événement récurrent par l'exception dans le calendrier
    calendarEvents = calendarEvents.map(e =>
      e.todoId === event.todoId && e.instanceDate?.getTime() === event.instanceDate?.getTime()
        ? { todoId: exceptionTodo.id } // Remplacer par référence à l'exception
        : e
    );
  }
}
```

#### Ajout d'un todo dans le fichier markdown

```typescript
async function addTodoToVault(todo: Todo): Promise<void> {
  const file = vault.getAbstractFileByPath(todo.filePath);
  if (!file) return;

  const content = await vault.read(file);
  const lines = content.split('\n');

  // Construire la ligne de tâche
  const taskLine = buildTaskLine(todo);

  // Trouver où insérer (après le todo parent si c'est une exception)
  let insertIndex = lines.length;
  if (todo.parentRecurrenceId) {
    const parentTodo = todos.find(t => t.id === todo.parentRecurrenceId);
    if (parentTodo && parentTodo.lineNumber !== undefined) {
      insertIndex = parentTodo.lineNumber + 1;
    }
  }

  // Insérer la nouvelle ligne
  lines.splice(insertIndex, 0, taskLine);

  // Sauvegarder
  await vault.modify(file, lines.join('\n'));

  // Mettre à jour le lineNumber du nouveau todo
  todo.lineNumber = insertIndex;
}

function buildTaskLine(todo: Todo): string {
  const checkbox = {
    'todo': '[ ]',
    'in-progress': '[>]',
    'done': '[x]',
    'cancelled': '[-]'
  }[todo.status];

  const tags = todo.tags.map(t => `#${t}`).join(' ');
  const dateTime = todo.time ? `@${todo.date} ${todo.time}` : todo.date ? `@${todo.date}` : '';
  const priority = todo.priority ? `!${todo.priority}` : '';
  const duration = todo.duration
    ? (todo.duration >= 60 ? `⏱${Math.round(todo.duration / 60)}h` : `⏱${todo.duration}min`)
    : '';

  const parts = [
    `- ${checkbox}`,
    todo.text,
    tags,
    dateTime,
    priority,
    duration
  ].filter(p => p);

  return parts.join(' ');
}
```

#### Exemple dans le fichier markdown

**Avant modification :**
```markdown
- [ ] Standup meeting #work @2025-10-06 09:00 !high ⏱30min 🔁weekly
```

**Après avoir déplacé l'instance du 13/10 vers 15h (choix : "Cette instance seulement") :**
```markdown
- [ ] Standup meeting #work @2025-10-06 09:00 !high ⏱30min 🔁weekly
- [ ] Standup meeting #work @2025-10-13 15:00 !high ⏱30min
```

**Après avoir marqué l'instance du 20/10 comme terminée :**
```markdown
- [ ] Standup meeting #work @2025-10-06 09:00 !high ⏱30min 🔁weekly
- [ ] Standup meeting #work @2025-10-13 15:00 !high ⏱30min
- [x] Standup meeting #work @2025-10-20 09:00 !high ⏱30min
```

**Calendrier résultant :**
- **Lundi 06/10 à 09h** : Instance générée depuis la récurrence
- **Lundi 13/10 à 15h** : Exception (todo indépendant)
- **Lundi 20/10** : ~~Instance générée~~ (masquée car exception existe avec statut "done")
- **Lundi 27/10 à 09h** : Instance générée depuis la récurrence
- etc.

### 5.5 Sous-tâches

Affichage dans le TodoItem :

```
┌────────────────────────────────┐
│ [H] Projet principal (2/5)    │
│ 📅 06/10 ⏰ 14:30             │
│ ─ [x] Sous-tâche 1            │
│ ─ [x] Sous-tâche 2            │
│ ─ [ ] Sous-tâche 3            │
│ ─ [ ] Sous-tâche 4            │
│ ─ [ ] Sous-tâche 5            │
└────────────────────────────────┘
```

### 5.6 Vue multi-semaines

Ajouter une option pour afficher 2-4 semaines simultanément :

```
┌─────────────────────────────────────────────────────────────┐
│  < >  Octobre 2025                    [Semaine] [2 sem] ... │
└─────────────────────────────────────────────────────────────┘
```

### 5.7 Filtres et vues

- **Filtre par tag** : Afficher uniquement les tâches avec certains tags
- **Filtre par priorité** : Critical/High uniquement
- **Vue "Today"** : Focus sur aujourd'hui uniquement
- **Vue "Month"** : Vue mensuelle compacte

### 5.8 Statistiques

Afficher dans un panneau latéral :
- Tâches complétées cette semaine
- Temps total planifié
- Distribution par tag
- Burndown chart

---

## 6. États et Stockage

### 6.1 State management

```typescript
// Store Svelte global
interface AppState {
  // Données
  todos: Todo[];
  calendarEvents: CalendarEvent[];
  tagGroups: TagGroup[];

  // UI State
  currentWeekStart: Date;
  selectedTodo: Todo | null;
  collapsedTags: Set<string>;
  searchQuery: string;

  // Filtres
  activeFilters: {
    tags: string[];
    priorities: Priority[];
    status: Status[];
  };
}
```

### 6.2 Persistance

- **Todos** : Lus depuis le vault (source de vérité)
- **CalendarEvents** : Sauvegardés dans `data.json` du plugin
- **UI State** : Sauvegardé dans `data.json` (tags collapsed, filtres, etc.)

```typescript
interface PluginData {
  calendarEvents: CalendarEvent[];
  uiState: {
    collapsedTags: string[];
    activeFilters: any;
  };
  settings: {
    defaultDuration: number;
    weekStartDay: 'monday' | 'sunday';
    timeFormat: '12h' | '24h';
  };
}
```

---

## 7. Améliorations futures

### 7.1 Intégrations

- **Google Calendar** : Sync bidirectionnel
- **Todoist / TickTick** : Import/export
- **Calendrier iOS/Android** : Via plugin mobile

### 7.2 Personnalisation

- **Thèmes de couleurs** : Par tag, par priorité
- **Raccourcis clavier** : Navigation rapide
- **Templates de tâches** : Créer rapidement des tâches récurrentes

### 7.3 Collaboration

- **Partage de tâches** : Via Obsidian Sync
- **Assignation** : Attribuer des tâches à des personnes
- **Commentaires** : Discussion sur les tâches

### 7.4 IA et automatisation

- **Suggestions de planification** : Optimiser le calendrier
- **Détection de conflits** : Alerter si trop de tâches
- **Auto-tagging** : Suggérer des tags basés sur le contenu

---

## 8. Architecture technique

### 8.1 Structure des fichiers

```
calendtask/
├── main.ts                      # Point d'entrée du plugin
├── CalendTaskView.ts            # Container principal
├── services/
│   ├── TodoParser.ts            # Parse les fichiers markdown
│   ├── VaultSync.ts             # Synchronisation avec le vault
│   └── RecurrenceEngine.ts      # Gestion des récurrences
├── stores/
│   ├── todoStore.ts             # Store Svelte pour todos
│   ├── calendarStore.ts         # Store pour événements calendrier
│   └── uiStore.ts               # Store pour l'état UI
├── components/
│   ├── TodoColumn.svelte            # Colonne de gauche
│   ├── TodoItem.svelte              # Item todo individuel
│   ├── TagGroup.svelte              # Groupe de tags avec fold
│   ├── CalendarView.svelte          # Vue calendrier
│   ├── CalendarEvent.svelte         # Événement calendrier
│   ├── AllDayZone.svelte            # Zone "all-day"
│   ├── RecurrenceChoiceModal.ts     # Modale choix récurrence
│   └── EventDetailsModal.svelte     # Modale de détails
├── utils/
│   ├── dateUtils.ts             # Utilitaires de dates
│   ├── dragDropUtils.ts         # Logique drag & drop
│   ├── editorUtils.ts           # Ouverture de fichiers dans l'éditeur
│   └── colorUtils.ts            # Gestion des couleurs
├── types/
│   └── index.ts                 # Interfaces TypeScript
├── styles.css                   # Styles globaux
└── ARCHITECTURE.md              # Ce fichier
```

### 8.2 Flux de données

```
Vault Obsidian
    ↓ (read)
TodoParser
    ↓
todoStore (Svelte)
    ↓
TodoColumn Component
    ↓ (drag & drop)
CalendarView Component
    ↓
calendarStore (Svelte)
    ↓ (save)
data.json + Vault (update)
```

---

## 9. Checklist d'implémentation

### Phase 1 : Fondations
- [ ] Définir les interfaces TypeScript
- [ ] Implémenter TodoParser pour format liste inline
- [ ] Mettre en place les stores Svelte
- [ ] Refactoriser TodoColumn avec TagGroup
- [ ] Ajouter la zone "all-day" au calendrier

### Phase 2 : Synchronisation
- [ ] VaultSync : lecture des todos du vault
- [ ] VaultSync : mise à jour lors de drag & drop
- [ ] Watcher sur les fichiers pour auto-refresh
- [ ] Sauvegarde/chargement de data.json

### Phase 3 : Fonctionnalités
- [ ] Système de priorités (UI + icônes)
- [ ] Fold/unfold des tags
- [ ] Recherche/filtrage
- [ ] Parsing des tâches inline (format liste)
- [ ] Support des durées estimées
- [ ] Double-clic pour ouvrir le fichier source (editorUtils.ts)

### Phase 4 : Avancé
- [ ] Récurrences : génération d'instances
- [ ] Récurrences : modale de choix (cette instance / toutes)
- [ ] Récurrences : système d'exceptions
- [ ] Récurrences : parsing de la syntaxe `🔁weekly` ou `recur:weekly`
- [ ] Sous-tâches
- [ ] Statistiques
- [ ] Export/import

---

## 10. Considérations de performance

- **Lazy loading** : Ne parser que les fichiers visibles
- **Debouncing** : Sur la recherche et les mises à jour
- **Virtual scrolling** : Pour de grandes listes de todos
- **Memoization** : Cache des calculs de récurrence
- **Web Workers** : Pour le parsing intensif (si nécessaire)

---

**Dernière mise à jour** : 2025-10-06
