// The design system's Icon component reads Lucide from window.lucide. The app's CSP allows no CDN
// scripts, so the version the design system specifies is bundled and only the icons in use are registered.
// Add an icon here before using <Icon name="…"/>.
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Ellipsis, Plus, Minus, Receipt,
  ArrowLeftRight, RefreshCw, Layers, LayoutDashboard, List, Settings, Tags, Wallet, X, Search, Link2, Undo2, User, Users, Pin, PinOff,
  FileDown, FileX, FileText, ArrowLeft, ArrowRight, ArrowUpRight, CircleCheck, CircleDashed, CircleAlert, TriangleAlert, Info, CircleHelp,
  GripVertical, FolderOpen, Download, Trash2, Pencil, SlidersHorizontal, CornerDownLeft, RotateCcw, Palette, Unlink, Upload,
  Sparkles, Terminal, LogIn, LogOut, GitMerge, FolderPlus, LoaderCircle,
} from 'lucide';

const icons = {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Ellipsis, Plus, Minus, Receipt,
  ArrowLeftRight, RefreshCw, Layers, LayoutDashboard, List, Settings, Tags, Wallet, X, Search, Link2, Undo2, User, Users, Pin, PinOff,
  FileDown, FileX, FileText, ArrowLeft, ArrowRight, ArrowUpRight, CircleCheck, CircleDashed, CircleAlert, TriangleAlert, Info, CircleHelp,
  GripVertical, FolderOpen, Download, Trash2, Pencil, SlidersHorizontal, CornerDownLeft, RotateCcw, Palette, Unlink, Upload,
  Sparkles, Terminal, LogIn, LogOut, GitMerge, FolderPlus, LoaderCircle,
};
window.lucide = { ...(window.lucide || {}), icons: { ...(window.lucide?.icons || {}), ...icons } };
