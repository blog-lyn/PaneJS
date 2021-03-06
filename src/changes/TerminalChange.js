import Change from './Change';


export default class TerminalChange extends Change {

  constructor(model, link, terminal, isSource) {

    super();

    this.model    = model;
    this.link     = link;
    this.terminal = terminal;
    this.previous = terminal;
    this.isSource = isSource;
  }

  digest() {

    this.terminal = this.previous;
    this.previous = this.model.terminalChanged(this.link, this.terminal, this.isSource);

    return this;
  }
}
