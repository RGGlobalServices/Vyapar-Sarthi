import { create } from 'zustand';

interface NotificationState {
  unreadCount: number;
  upcomingEventsCount: number;
  setUnreadCount: (count: number) => void;
  setUpcomingEventsCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  upcomingEventsCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  setUpcomingEventsCount: (count) => set({ upcomingEventsCount: count }),
}));
