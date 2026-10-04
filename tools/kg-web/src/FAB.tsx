// Floating Action Button (bottom-right). Only shown when nothing is selected.
// Click → opens BottomSheet with node-kind list to create a new node.

interface Props {
  onClick: () => void
}

export function FAB({ onClick }: Props) {
  return (
    <button className="fab" onClick={onClick} aria-label="New node">＋</button>
  )
}
