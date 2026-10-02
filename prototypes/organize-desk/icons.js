// The design system's Icon reads Lucide from window.lucide. Register only the glyphs this study uses.
import {ArrowLeftRight, CalendarDays, Check, ChevronDown, Link2, Plus, Search, Undo2, Unlink2, User, X, Receipt, Moon, Sun, CornerDownLeft} from 'lucide';
const icons = {ArrowLeftRight, CalendarDays, Check, ChevronDown, Link2, Plus, Search, Undo2, Unlink2, User, X, Receipt, Moon, Sun, CornerDownLeft};
window.lucide = {...(window.lucide || {}), icons: {...(window.lucide?.icons || {}), ...icons}};
