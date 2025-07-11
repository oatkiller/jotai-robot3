import { render, fireEvent, cleanup } from '@testing-library/react';
import { Provider, useAtom } from 'jotai/react';
import React from 'react';
import { createMachine, state, transition } from 'robot3';
import { atomWithMachine, RESTART } from '../src';

// Simple toggle machine similar to jotai-xstate tests
const toggleMachine = createMachine({
  inactive: state(transition('TOGGLE', 'active')),
  active: state(transition('TOGGLE', 'inactive')),
});

const toggleMachineAtom = atomWithMachine(() => toggleMachine);

afterEach(cleanup);

test('toggle machine transitions', async () => {
  const Toggler = () => {
    const [state, send] = useAtom(toggleMachineAtom);
    return (
      <button onClick={() => send('TOGGLE')} data-testid="btn">
        {state.current === 'inactive' ? 'Click to activate' : 'Active! Click to deactivate'}
      </button>
    );
  };

  const { findByText, getByTestId } = render(
    <Provider>
      <Toggler />
    </Provider>
  );

  await findByText('Click to activate');
  fireEvent.click(getByTestId('btn'));
  await findByText('Active! Click to deactivate');
  fireEvent.click(getByTestId('btn'));
  await findByText('Click to activate');
});

test('restartable machine', async () => {
  const restartableMachine = createMachine({
    idle: state(transition('PRESS', 'counting')),
    counting: state(transition('PRESS', 'counting')),
  });

  const restartAtom = atomWithMachine(() => restartableMachine);

  const Counter = () => {
    const [state, send] = useAtom(restartAtom);
    return (
      <>
        <div data-testid="state">{state.current}</div>
        <button onClick={() => send(RESTART)} data-testid="reset">RESET</button>
        <button onClick={() => send('PRESS')} data-testid="press">PRESS</button>
      </>
    );
  };

  const { getByTestId, findByText } = render(
    <Provider>
      <Counter />
    </Provider>
  );

  await findByText('idle');
  fireEvent.click(getByTestId('press'));
  await findByText('counting');
  fireEvent.click(getByTestId('reset'));
  await findByText('idle');
}); 