# Système de Redimensionnement des Todos

## Vue d'ensemble

Le système de redimensionnement permet à l'utilisateur de modifier la durée et l'heure de début d'un todo directement sur le calendrier en faisant glisser les bordures (handles) en haut ou en bas de l'événement.

## Architecture

### 1. Variables d'État (Svelte 5 Runes)

```typescript
// État du redimensionnement
let isResizing = $state(false);              // Indique si un resize est en cours
let resizeEventId = $state<string | null>(null);  // ID du todo en cours de resize
let resizeTodo = $state<Todo | null>(null);  // Référence au todo complet

// Variables de tracking
let initialY = 0;                            // Position Y initiale de la souris
let initialDuration = 0;                     // Durée initiale du todo
let initialTime: string | null = null;       // Heure initiale du todo
let resizeHandleType: 'top' | 'bottom' | null = null;  // Quel handle est utilisé

// État visuel temporaire (pas sauvegardé tant que mouseup n'est pas déclenché)
let resizeVisualState = $state<{ time?: string; duration?: number } | null>(null);
```

**Pourquoi `$state()` ?**
- Svelte 5 nécessite `$state()` pour la réactivité
- Permet au composant de se mettre à jour automatiquement quand ces valeurs changent

---

## 2. Fonctions Principales

### 2.1 `handleMouseDown()` - Initialisation du Resize

**Déclenchement :** Clic sur un resize handle (top ou bottom)

```typescript
function handleMouseDown(event: MouseEvent, todo: Todo, type: 'top' | 'bottom') {
  isResizing = true;
  resizeEventId = todo.id;
  resizeTodo = todo;
  initialY = event.clientY;
  initialDuration = todo.duration || 30;
  initialTime = todo.time || null;
  resizeHandleType = type;

  // Initialize visual state with current values to prevent jump
  resizeVisualState = {
    time: todo.time,
    duration: todo.duration || 30
  };

  event.stopPropagation();
  event.preventDefault();

  // Attach listeners only when needed
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}
```

**Étapes :**
1. Enregistre l'état initial (position souris, durée, heure)
2. **Initialise `resizeVisualState`** avec les valeurs actuelles pour éviter le "saut" visuel
3. Attache les listeners globaux `mousemove` et `mouseup`

---

### 2.2 `handleMouseMove()` - Calcul en Temps Réel

**Déclenchement :** Mouvement de la souris pendant le resize

```typescript
function handleMouseMove(event: MouseEvent) {
  if (!isResizing || !resizeEventId || !resizeTodo || !initialTime) return;

  const deltaY = event.clientY - initialY;
  const cellHeight = 40; // 40px par heure
  const deltaMinutes = Math.round((deltaY / cellHeight) * 60);

  if (resizeHandleType === 'bottom') {
    // Resize depuis le bas : augmenter/diminuer la durée
    let newDuration = Math.max(15, initialDuration + deltaMinutes); // Min 15 minutes
    // Snap to 15-minute increments
    newDuration = Math.round(newDuration / 15) * 15;

    // Vérifier que l'événement ne dépasse pas 23:59
    const [hours, minutes] = initialTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + newDuration;

    // Limite à 23:59 (1439 minutes depuis minuit)
    if (endMinutes > 1439) {
      newDuration = 1439 - startMinutes;
    }

    // Store in local state only (no store update = no re-render)
    resizeVisualState = { duration: newDuration };

  } else if (resizeHandleType === 'top') {
    // Resize depuis le haut : déplacer l'heure de début ET ajuster la durée
    const [hours, minutes] = initialTime.split(':').map(Number);
    const initialMinutesFromMidnight = hours * 60 + minutes;

    // Calculer la nouvelle heure de début
    let newStartMinutes = initialMinutesFromMidnight + deltaMinutes;
    // Snap to 15-minute increments
    newStartMinutes = Math.round(newStartMinutes / 15) * 15;

    // Calculer la fin (qui reste fixe)
    const endMinutes = initialMinutesFromMidnight + initialDuration;

    // Calculer la nouvelle durée
    let newDuration = endMinutes - newStartMinutes;

    // Minimum 15 minutes
    if (newDuration < 15) {
      newDuration = 15;
      newStartMinutes = endMinutes - 15;
    }

    // Calculer la nouvelle heure
    const newHours = Math.floor(newStartMinutes / 60);
    const newMinutes = newStartMinutes % 60;

    // Vérifier les limites (0:00 à 23:59)
    if (newHours >= 0 && newHours < 24 && endMinutes <= 1439) {
      const newTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
      // Store in local state only (no store update = no re-render)
      resizeVisualState = { time: newTime, duration: newDuration };
    }
  }
}
```

**Comportements différents selon le handle :**

#### Handle Bottom (bas)
- **Change** : Durée uniquement
- **Fixe** : Heure de début
- Calcul : `newDuration = initialDuration + deltaMinutes`

#### Handle Top (haut)
- **Change** : Heure de début ET durée
- **Fixe** : Heure de fin
- Calcul :
  - `newStartTime = initialTime + deltaMinutes`
  - `newDuration = endTime - newStartTime`

**Contraintes :**
- Snap à des incréments de 15 minutes
- Durée minimale : 15 minutes
- Limites : 0:00 à 23:59

---

### 2.3 `handleMouseUp()` - Finalisation et Sauvegarde

**Déclenchement :** Relâchement de la souris

```typescript
async function handleMouseUp() {
  if (isResizing && resizeTodo && resizeVisualState) {
    // Apply changes from visual state to store and save
    const updates: Partial<Todo> = {};

    if (resizeVisualState.time && resizeVisualState.time !== initialTime) {
      updates.time = resizeVisualState.time;
    }

    if (resizeVisualState.duration && resizeVisualState.duration !== initialDuration) {
      updates.duration = resizeVisualState.duration;
    }

    if (Object.keys(updates).length > 0) {
      await vaultSync.updateTodoInVault(resizeTodo, updates);
    }
  }

  isResizing = false;
  resizeEventId = null;
  resizeTodo = null;
  initialTime = null;
  resizeHandleType = null;
  resizeVisualState = null;

  // Detach listeners when done
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
}
```

**Étapes :**
1. Compare `resizeVisualState` avec les valeurs initiales
2. Si changement, appelle `vaultSync.updateTodoInVault()` pour sauvegarder
3. Réinitialise tout l'état de resize
4. Détache les listeners globaux

---

### 2.4 `getEventPosition()` - Calcul de Position CSS

```typescript
function getEventPosition(todo: Todo): { top: number; height: number; isAbsolute?: boolean } {
  // Use visual state if this event is being resized
  if (isResizing && resizeEventId === todo.id && resizeVisualState) {
    const time = resizeVisualState.time || todo.time;
    const duration = resizeVisualState.duration ?? todo.duration ?? 30;

    if (!time) return { top: 0, height: 40 };

    const [hours, minutes] = time.split(':').map(Number);

    // During resize, position absolutely from midnight (0:00)
    const top = hours * 40 + (minutes / 60) * 40;
    const height = (duration / 60) * 40;

    return { top, height, isAbsolute: true };
  }

  // Normal rendering - position relative to hour cell
  if (!todo.time) return { top: 0, height: 40 };

  const [hours, minutes] = todo.time.split(':').map(Number);
  const top = (minutes / 60) * 40;
  const duration = todo.duration || 30;
  const height = (duration / 60) * 40;

  return { top, height };
}
```

**Deux modes de calcul :**

#### Mode Normal (pas en resize)
- Position **relative** à la cellule horaire
- `top` = décalage des minutes dans l'heure (0-40px)
- Exemple : 14:30 → top = 20px (30 min / 60 * 40px)

#### Mode Resize (isAbsolute: true)
- Position **absolue** depuis minuit (0:00)
- `top` = heures * 40 + minutes / 60 * 40
- Exemple : 14:30 → top = 580px (14 * 40 + 20)

**Pourquoi cette différence ?**
Pendant le resize, le todo peut changer d'heure (avec handle top), donc il faut le positionner absolument par rapport à toute la grille, pas juste sa cellule d'origine.

---

## 3. Rendu du Template

### 3.1 Todos Normaux (dans les cellules)

```svelte
{#each getTodosForHour(dayMeta.date, hour, todosByDayHour) as todo (todo.id)}
  {#if !(isResizing && resizeEventId === todo.id)}
    {@const position = getEventPosition(todo)}
    <div
      class="calendar-event"
      style="top: {position.top}px; height: {position.height}px;"
      draggable="true"
      on:dragstart={(e) => handleEventDragStart(e, todo)}
      on:dblclick={() => handleEventDoubleClick(todo)}
      on:contextmenu={(e) => handleEventContextMenu(e, todo)}
    >
      {todo.text}
      <div
        class="resize-handle top"
        draggable="false"
        on:mousedown={(e) => handleMouseDown(e, todo, 'top')}
        role="slider"
        aria-label="Resize top"
        tabindex="0"
      ></div>
      <div
        class="resize-handle bottom"
        draggable="false"
        on:mousedown={(e) => handleMouseDown(e, todo, 'bottom')}
        role="slider"
        aria-label="Resize bottom"
        tabindex="0"
      ></div>
    </div>
  {/if}
{/each}
```

**Condition importante :**
```svelte
{#if !(isResizing && resizeEventId === todo.id)}
```
→ Masque le todo original pendant le resize (pour éviter la duplication)

---

### 3.2 Overlay de Resize (absolu sur la grille)

```svelte
<!-- Render resizing event as overlay -->
{#if isResizing && resizeTodo}
  {@const position = getEventPosition(resizeTodo)}
  {@const todoDate = resizeTodo.date}
  {#if todoDate}
    {@const dayIndex = daysMetadata.findIndex(d => formatDate(d.date) === todoDate)}
    {#if dayIndex !== -1}
      <div
        class="calendar-event resizing-overlay"
        style="
          position: absolute;
          left: calc(60px + {dayIndex} * ((100% - 60px) / 7) + 1px);
          width: calc((100% - 60px) / 7 - 2px);
          top: calc(80px + {position.top}px);
          height: {position.height}px;
          pointer-events: none;
          z-index: 100;
        "
      >
        {resizeTodo.text}
        <div
          class="resize-handle top"
          style="pointer-events: auto;"
          draggable="false"
          on:mousedown={(e) => handleMouseDown(e, resizeTodo!, 'top')}
          role="slider"
          aria-label="Resize top"
          tabindex="0"
        ></div>
        <div
          class="resize-handle bottom"
          style="pointer-events: auto;"
          draggable="false"
          on:mousedown={(e) => handleMouseDown(e, resizeTodo!, 'bottom')}
          role="slider"
          aria-label="Resize bottom"
          tabindex="0"
        ></div>
      </div>
    {/if}
  {/if}
{/if}
```

**Calculs de positionnement :**

- **Horizontal :** `left: calc(60px + {dayIndex} * ((100% - 60px) / 7) + 1px)`
  - 60px = colonne des heures
  - Division en 7 colonnes (jours)
  - +1px pour border

- **Vertical :** `top: calc(80px + {position.top}px)`
  - 80px = 40px (header) + 40px (all-day zone)
  - `position.top` = position depuis minuit (0:00)

- **Autres :**
  - `pointer-events: none` sur la div principale
  - `pointer-events: auto` sur les handles (pour garder l'interaction)
  - `z-index: 100` pour être au-dessus de tout

---

## 4. Styles CSS

```css
.resize-handle {
  position: absolute;
  left: 0;
  width: 100%;
  height: 8px;
  background-color: transparent;
  opacity: 0;
  transition: opacity 0.1s;
  z-index: 10;
}

.calendar-event:hover .resize-handle {
  opacity: 1;
  background-color: rgba(var(--interactive-accent-rgb), 0.3);
}

.resize-handle:hover {
  background-color: var(--interactive-accent) !important;
  opacity: 1 !important;
}

.resize-handle.top {
  top: -4px;
  cursor: ns-resize;
}

.resize-handle.bottom {
  bottom: -4px;
  cursor: ns-resize;
}
```

**Comportement :**
- Handles invisibles par défaut (`opacity: 0`)
- Apparaissent au hover de l'événement
- Hauteur 8px, positionnés à -4px/+4px (débordent de l'event)
- Curseur `ns-resize` (flèches verticales)

---

## 5. Diagramme de Flux

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIC SUR HANDLE (mousedown)                             │
│    - handleMouseDown()                                      │
│    - Enregistre état initial                                │
│    - Initialise resizeVisualState                           │
│    - Attache listeners globaux                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DRAG (mousemove) - BOUCLE                                │
│    - handleMouseMove()                                      │
│    - Calcule deltaY                                         │
│    - Calcule nouvelle durée/heure                           │
│    - Met à jour resizeVisualState                           │
│    - getEventPosition() utilise resizeVisualState           │
│    - Overlay se déplace/redimensionne visuellement          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. RELÂCHE (mouseup)                                        │
│    - handleMouseUp()                                        │
│    - Compare resizeVisualState avec valeurs initiales       │
│    - Si changement: vaultSync.updateTodoInVault()           │
│    - Réinitialise tout l'état                               │
│    - Détache listeners globaux                              │
│    - Overlay disparaît, todo réapparaît avec nouvelles      │
│      valeurs dans sa cellule                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Problèmes Résolus

### Problème 1 : "Saut" au début du resize
**Symptôme :** Le todo saute de position quand on clique sur le handle

**Cause :** `resizeVisualState` était `null` au moment du clic, donc `getEventPosition()` utilisait le mode normal (position relative) au lieu du mode resize (position absolue)

**Solution :** Initialiser `resizeVisualState` immédiatement dans `handleMouseDown()` avec les valeurs actuelles du todo

```typescript
// Initialize visual state with current values to prevent jump
resizeVisualState = {
  time: todo.time,
  duration: todo.duration || 30
};
```

---

### Problème 2 : Pas d'animation pendant le resize
**Symptôme :** Le todo ne se redimensionnait pas visuellement pendant le drag

**Cause :** Les variables `let` n'étaient pas réactives en Svelte 5

**Solution :** Utiliser `$state()` pour les variables d'état :
```typescript
let isResizing = $state(false);
let resizeEventId = $state<string | null>(null);
let resizeTodo = $state<Todo | null>(null);
let resizeVisualState = $state<{ time?: string; duration?: number } | null>(null);
```

---

### Problème 3 : Resize par le haut donnait des résultats bizarres
**Symptôme :** Quand on redimensionne par le haut, l'événement se réduisait des deux côtés

**Cause :** Le todo restait rendu dans sa cellule horaire d'origine (basée sur le store), mais avec la nouvelle heure calculée

**Solution :** Système d'overlay
1. Masquer le todo original pendant le resize : `{#if !(isResizing && resizeEventId === todo.id)}`
2. Rendre un overlay avec position absolue par rapport à toute la grille
3. `getEventPosition()` calcule depuis minuit (0:00) quand `isAbsolute: true`

---

## 7. Considérations Futures

### Performance
- Les listeners globaux sont attachés/détachés dynamiquement (pas toujours actifs)
- `resizeVisualState` évite les re-renders du store pendant le drag
- Sauvegarde uniquement à `mouseup` (pas à chaque mouvement)

### Améliorations Possibles
- [ ] Ajouter une preview de l'heure pendant le resize (tooltip)
- [ ] Animation de transition quand on relâche
- [ ] Gestion du resize sur mobile (touch events)
- [ ] Undo/redo pour les changements de taille
- [ ] Snap à d'autres incréments (5min, 10min, 30min) selon un setting

---

## 8. Fichiers Concernés

```
components/CalendarView.svelte
├── Variables d'état (lignes 22-31)
├── handleMouseDown() (lignes 137-158)
├── handleMouseMove() (lignes 160-219)
├── handleMouseUp() (lignes 221-249)
├── getEventPosition() (lignes 333-359)
├── Template - Todos normaux (lignes 402-432)
└── Template - Overlay resize (lignes 437-478)

styles.css
└── .resize-handle (lignes 182-210)
```
