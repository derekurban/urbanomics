// The design system's Icon component reads Lucide from window.lucide. The app's CSP allows no CDN
// scripts, so the version the design system specifies is bundled and only the icons in use are registered.
// Add an icon here before using <Icon name="…"/>.
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Check, ChevronLeft, ChevronRight, Ellipsis, Plus, Receipt, ArrowLeftRight, RefreshCw,
  Layers, LayoutDashboard, List, Settings, Tags, Wallet, X, Search, Link2, Undo2, User,
} from 'lucide';

const icons = {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Check, ChevronLeft, ChevronRight, Ellipsis, Plus, Receipt, ArrowLeftRight, RefreshCw,
  Layers, LayoutDashboard, List, Settings, Tags, Wallet, X, Search, Link2, Undo2, User,
};
window.lucide = { ...(window.lucide || {}), icons: { ...(window.lucide?.icons || {}), ...icons } };
