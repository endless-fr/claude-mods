import type { ClientModule } from 'claude-code'

/** What the pane hands one file's row. */
export type RowProps = { name: string; dir: string; isOpen: boolean }

/**
 * One file's row on the desktop: its name and where it lives.
 * A click anywhere on it asks the hooks module to fold or unfold its diff.
 */
const Row: ClientModule<RowProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  surface.onPointer(event => {
    if (event.type === 'up' && (event.button ?? 'left') === 'left') surface.post({ toggle: true })
  })

  return (
    <Box flexDirection="row" alignItems="center" gap={2} width="100%">
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text bold color={props.isOpen ? '#0A84FF' : '#F5F5F7'} wrap="truncate-end">
          {props.name}
        </Text>
        <Text color="#8E8E93" wrap="truncate-start">
          {props.dir}
        </Text>
      </Box>
    </Box>
  )
}

export default Row
