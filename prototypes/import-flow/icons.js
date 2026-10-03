import {ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, CircleDashed, FileText, Info, Layers, Moon, Pencil, Plus, Sparkles, Sun, Wallet, X} from 'lucide';
const icons = {ArrowLeft, ArrowRight, Check, ChevronDown, CircleCheck, CircleDashed, FileText, Info, Layers, Moon, Pencil, Plus, Sparkles, Sun, Wallet, X};
window.lucide = {...(window.lucide || {}), icons: {...(window.lucide?.icons || {}), ...icons}};
