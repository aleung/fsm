import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fsm from '../src/fsm';

chai.use(sinonChai);
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('fsm', () => {
  it('can throw error on invalid state reference', () => {
    expect(() => fsm.create({
      initialState: 'unknown',
      states: {
        off: {
          actions: {
            onEntry: () => {
              // turn on
            }
          },
          transitions: {
            singleClick: 'on',
            doubleClick: 'blink',
          }
        },
        blink: {
          transitions: {
            singleClick: 'off'
          }
        }
      },
      transitions: {
        default: {
          to: 'error'
        }
      }
    })).to.throw(/unknown,on,error/);
  });

  it('can enter init state after created', async () => {
    const entryAction = sinon.spy();
    const machine = fsm.create({
      initialState: 'firstState',
      states: {
        firstState: {
          actions: {
            onEntry: entryAction,
          },
        },
      },
    });
    expect(machine.currentState).to.equal('__init__');
    await machine.init();
    expect(machine.currentState).to.equal('firstState');
    expect(entryAction).has.been.calledOnce.calledWith('__init__');
  });

  it('can transite to new state on event', async () => {
    const entryAction = sinon.spy();
    const exitAction = sinon.spy();
    const machine = fsm.create({
      initialState: 'firstState',
      states: {
        firstState: {
          actions: {
            onExit: exitAction,
          },
          transitions: {
            event: 'secondState',
          },
        },
        secondState: {
          actions: {
            onEntry: entryAction,
          },
        }
      },
    });
    await machine.init();
    expect(machine.currentState).to.equal('firstState');
    await machine.send({ name: 'event' });
    expect(machine.currentState).to.equal('secondState');
    expect(entryAction).has.been.calledOnce.calledWith('firstState');
    expect(exitAction).has.been.calledOnce.calledWith('secondState');
    expect(exitAction).has.been.calledBefore(entryAction);
  });

  it('can use default transite rule if no matching', async () => {
    const machine = fsm.create({
      initialState: 'firstState',
      states: {
        firstState: {
          transitions: {
            event: 'firstState',
            default: 'secondState',
          },
        },
        secondState: {
        }
      },
      transitions: {
        otherEvent: 'firstState'
      }
    });
    await machine.init();
    expect(machine.currentState).to.equal('firstState');
    await machine.send({ name: 'otherEvent' });
    expect(machine.currentState).to.equal('secondState');
  });

  it('can fallback to global transite rules if no rule can be resolved in state', async () => {
    const machine = fsm.create({
      initialState: 'firstState',
      states: {
        firstState: {
          transitions: {
            event: 'firstState',
          },
        },
        secondState: {
        }
      },
      transitions: {
        otherEvent: 'secondState'
      }
    });
    await machine.init();
    expect(machine.currentState).to.equal('firstState');
    await machine.send({ name: 'otherEvent' });
    expect(machine.currentState).to.equal('secondState');
  });

  it('can transite to current state', async () => {
    const entryAction = sinon.spy();
    const exitAction = sinon.spy();
    const transiteAction = sinon.spy();
    const machine = fsm.create({
      initialState: 'firstState',
      states: {
        firstState: {
          actions: {
            onEntry: entryAction,
            onExit: exitAction,
          },
          transitions: {
            event: {
              to: 'firstState',
              action: transiteAction,
            },
          },
        },
      },
    });
    await machine.init();
    expect(machine.currentState).to.equal('firstState');
    await machine.send({ name: 'event' });
    expect(machine.currentState).to.equal('firstState');
    expect(entryAction).has.been.calledTwice.calledWith('firstState');
    expect(exitAction).has.been.calledOnce.calledWith('firstState');
    expect(transiteAction).has.been.calledOnce.calledWith({ name: 'event' });
    expect(exitAction).has.been.calledBefore(transiteAction);
    expect(transiteAction).has.been.calledBefore(entryAction);
  });

  it('can throw error on unhandled event', async () => {
    const machine = fsm.create({
      initialState: 'firstState',
      states: {
        firstState: {
          transitions: {
          },
        },
      },
    });
    await machine.init();
    expect(machine.currentState).to.equal('firstState');
    return expect(machine.send({ name: 'event' })).to.be.rejectedWith(/Event event is invalid/);
  });
});
