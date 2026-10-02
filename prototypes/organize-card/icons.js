import {ArrowLeftRight, CalendarDays, Check, ChevronDown, ChevronRight, Link2, Plus, Search, Undo2, Unlink2, User, Users, X, Receipt, Moon, Sun, Sparkles, Repeat, Pencil, FileText, Circle, CircleCheck, CircleDashed, Info} from 'lucide';
const icons = {ArrowLeftRight, CalendarDays, Check, ChevronDown, ChevronRight, Link2, Plus, Search, Undo2, Unlink2, User, Users, X, Receipt, Moon, Sun, Sparkles, Repeat, Pencil, FileText, Circle, CircleCheck, CircleDashed, Info};
window.lucide = {...(window.lucide || {}), icons: {...(window.lucide?.icons || {}), ...icons}};
