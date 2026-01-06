import { ReactComponent as WalletIcon } from '../../assets/icons/wallet-icon.svg'
import { ReactComponent as ClockIcon } from '../../assets/icons/clock-icon.svg'
import { router } from '../router'

const keyToPathMap: Record<string, string> = {
    assets: '/my-assets',
    history: '/history',
}

const onTabClick = (key: keyof typeof keyToPathMap) => {
    router.navigate({ to: keyToPathMap[key] })
}

export const TABS = [
    { key: 'assets', label: 'My Assets', icon: WalletIcon, onTabClick: () => onTabClick('assets') },
    { key: 'history', label: 'History', icon: ClockIcon, onTabClick: () => onTabClick('history') },
];