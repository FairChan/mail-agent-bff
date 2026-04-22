import { create } from "zustand";
import type { EventCluster, MailKnowledgeRecord, PersonProfile } from "@mail-agent/shared-types";

export const DRAWER_CLOSE_ANIMATION_MS = 220;

export type MailKnowledgeDetailDrawerProps = {
  mail: MailKnowledgeRecord;
  personName: string;
  personEmail?: string | null;
  eventName: string | null;
};

export type EventClusterDetailDrawerProps = {
  event: EventCluster;
  relatedMails: MailKnowledgeRecord[];
  personNameById: Record<string, string>;
};

export type PersonProfileDetailDrawerProps = {
  person: PersonProfile;
  relatedMails: MailKnowledgeRecord[];
  eventNameById: Record<string, string>;
};

export type ArtifactContentDetailDrawerProps = {
  artifact: {
    key: string;
    label: string;
    path: string;
  };
  content: {
    key: string;
    label: string;
    path: string;
    kind: "markdown" | "json";
    content: string;
  } | null;
  baselineReady: boolean;
  error: string | null;
};

export type DrawerRegistry = {
  mailKnowledgeDetail: MailKnowledgeDetailDrawerProps;
  eventClusterDetail: EventClusterDetailDrawerProps;
  personProfileDetail: PersonProfileDetailDrawerProps;
  artifactContentDetail: ArtifactContentDetailDrawerProps;
};

export type DrawerComponentName = keyof DrawerRegistry;
export type DrawerPhase = "open" | "closing";

export type DrawerStackItem = {
  [Name in DrawerComponentName]: {
    id: string;
    componentName: Name;
    props: DrawerRegistry[Name];
    phase: DrawerPhase;
    openedAt: number;
  };
}[DrawerComponentName];

type DrawerState = {
  stack: DrawerStackItem[];
  openDrawer: <Name extends DrawerComponentName>(componentName: Name, props: DrawerRegistry[Name]) => string;
  closeDrawer: (componentName: DrawerComponentName) => void;
  closeDrawerById: (id: string) => void;
  closeTopDrawer: () => void;
  closeAllDrawers: () => void;
  removeDrawer: (id: string) => void;
};

const closeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function createDrawerId(componentName: DrawerComponentName) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${componentName}:${crypto.randomUUID()}`;
  }
  return `${componentName}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function scheduleDrawerRemoval(id: string) {
  const existingTimer = closeTimers.get(id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    closeTimers.delete(id);
    useDrawerStore.getState().removeDrawer(id);
  }, DRAWER_CLOSE_ANIMATION_MS);
  closeTimers.set(id, timer);
}

function markDrawerClosing(stack: DrawerStackItem[], id: string) {
  let didChange = false;
  const nextStack = stack.map((item) => {
    if (item.id !== id || item.phase === "closing") {
      return item;
    }
    didChange = true;
    scheduleDrawerRemoval(id);
    return { ...item, phase: "closing" as const };
  });

  return didChange ? nextStack : stack;
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
  stack: [],

  openDrawer: (componentName, props) => {
    const id = createDrawerId(componentName);
    const entry = {
      id,
      componentName,
      props,
      phase: "open",
      openedAt: Date.now(),
    } as DrawerStackItem;

    set((state) => ({
      stack: [...state.stack, entry],
    }));

    return id;
  },

  closeDrawer: (componentName) => {
    const target = [...get().stack].reverse().find(
      (item) => item.componentName === componentName && item.phase !== "closing"
    );
    if (!target) {
      return;
    }
    get().closeDrawerById(target.id);
  },

  closeDrawerById: (id) => {
    set((state) => ({
      stack: markDrawerClosing(state.stack, id),
    }));
  },

  closeTopDrawer: () => {
    const top = [...get().stack].reverse().find((item) => item.phase !== "closing");
    if (!top) {
      return;
    }
    get().closeDrawerById(top.id);
  },

  closeAllDrawers: () => {
    set((state) => ({
      stack: state.stack.map((item) => {
        if (item.phase === "closing") {
          return item;
        }
        scheduleDrawerRemoval(item.id);
        return { ...item, phase: "closing" as const };
      }),
    }));
  },

  removeDrawer: (id) => {
    const timer = closeTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      closeTimers.delete(id);
    }
    set((state) => ({
      stack: state.stack.filter((item) => item.id !== id),
    }));
  },
}));

export const drawerActions = {
  openDrawer: <Name extends DrawerComponentName>(componentName: Name, props: DrawerRegistry[Name]) =>
    useDrawerStore.getState().openDrawer(componentName, props),
  closeDrawer: (componentName: DrawerComponentName) => useDrawerStore.getState().closeDrawer(componentName),
  closeTopDrawer: () => useDrawerStore.getState().closeTopDrawer(),
  closeAllDrawers: () => useDrawerStore.getState().closeAllDrawers(),
};
