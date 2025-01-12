import {exceptionNodes, exceptionCode} from './nipypeStupidExceptions';

const LANGUAGE = 'Nipype';

export const mapNodeFields = (node) => {
  const iteratorFields = node.parameters
      .filter((parameter) => parameter.isIterable)
      .map((parameter) => parameter.name);
  return iteratorFields;
};

export const iterableCode = (node) => {
  const iterables = {};
  const givenName = node.name;
  let code = '';
  node.parameters &&
    node.parameters
        .filter((parameter) => parameter.value !== '' && parameter.input)
        .forEach((parameter) => {
          if (parameter.isIterable) {
            iterables[parameter.name] = parameter.value;
          } else {
            code += `${givenName}.inputs.${parameter.name} = ${
              parameter.value
            }\r\n`;
          }
        });
  if (Object.keys(iterables).length) {
    code += `${node.name}.iterables = [${Object.keys(iterables)
        .map((key) => {
          return `('${key}', ${iterables[key]})`;
        })
        .join(',')}]\r\n`;
  }
  return code;
};

const writePreamble = (nodes) => {
  const preamble = `#This is a Nipype generator. Warning, here be dragons.
#!/usr/bin/env python

import sys
import nipype
import nipype.pipeline as pe
`;

  const imports =
    nodes &&
    nodes.map((node) => {
      const codeArgument =
        node.code && node.code.find((a) => a.language === LANGUAGE);
      return (
        codeArgument &&
        codeArgument.argument &&
        `${codeArgument.argument.import}`
      );
    });

  return [preamble, [...new Set(imports)].join('\r\n'), ''].join('\r\n');
};

const writeNodes = (nodes) => {
  const code = nodes && nodes.map((node) => itemToCode(node));
  return code && code.join('\r\n');
};

const writeLinks = (links) => {
  let code = '';
  code += '#Create a workflow to connect all those nodes\r\n';
  code += 'analysisflow = nipype.Workflow(\'MyWorkflow\')\r\n';
  code += links && links.map((link) => linkToCode(link)).join('\r\n');

  return code;
};

const linkToCode = (link) => {
  if (
    link &&
    link.portFrom &&
    link.portTo &&
    link.portFrom.node &&
    link.portTo.node
  ) {
    const source = link.portFrom.node.name;
    const sourceAttribute = `${link.portFrom.name}`;
    const destination = link.portTo.node.name;
    const destinationAttribute = `${link.portTo.name}`;
    // eslint-disable-next-line
    return `analysisflow.connect(${source}, "${sourceAttribute}", ${destination}, "${destinationAttribute}")`;
  } else {
    return '';
  }
};

const itemToCode = (node) => {
  const codeArgument =
    node.code && node.code.find((a) => a.language === LANGUAGE);
  if (!codeArgument) {
    return '';
  }

  if (exceptionNodes.includes(codeArgument.argument.name)) {
    return exceptionCode(node);
  }

  let code = `#${codeArgument.comment}\r\n`;
  const iteratorFields = mapNodeFields(node);
  // #TODO condition on baing iterable
  const nodeType = iteratorFields.length ? 'MapNode' : 'Node';
  const givenName = node.name;
  code += `${givenName} = pe.${nodeType}(interface = ${
    codeArgument.argument.name
  }, name='${givenName}'`;
  if (iteratorFields.length) {
    code += `, iterfield = ['${iteratorFields.join(`', '`)}']`;
  }
  code += `)\r\n`;
  code += iterableCode(node);

  return code;
};

const writePostamble = () => {
  return `
#Run the workflow
plugin = 'MultiProc' #adjust your desired plugin here
plugin_args = {'n_procs': 1} #adjust to your number of cores
analysisflow.write_graph(graph2use='flat', format='png', simple_form=False)
analysisflow.run(plugin=plugin, plugin_args=plugin_args)
`;
};

export function writeCode(nodes, links) {
  const preamble = writePreamble(nodes);
  const nodeCode = writeNodes(nodes);
  const linkCode = writeLinks(links);
  const postAmble = writePostamble();

  return [preamble, nodeCode, linkCode, postAmble].join('\r\n');
}

export function writeFiles(nodes, links) {
  const pythonFile = 'GIRAFFE/code/workflow.py';

  return {
    [pythonFile]: writeCode(nodes, links),
  };
}
